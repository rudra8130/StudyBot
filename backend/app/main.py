from __future__ import annotations

import math
import os
import re
import uuid
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import fitz
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

load_dotenv()

app = FastAPI(title="StudyFlow API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)

MAX_PDF_BYTES = 20 * 1024 * 1024
CHUNK_WORDS = 180
CHUNK_OVERLAP = 35
STOP_WORDS = set("a an the and or but if then of to in on for from with by as is are was were be been being it its this that these those into about over under than their they them he she we you your i our not no do does did can could should would will may might have has had what which who when where why how also very more most some such".split())


@dataclass
class Chunk:
    text: str
    page: int
    terms: list[str]


@dataclass
class StudyDoc:
    id: str
    name: str
    pages: int
    chunks: list[Chunk]
    term_frequencies: list[Counter]
    document_frequency: Counter
    average_length: float


documents: dict[str, StudyDoc] = {}


class AskBody(BaseModel):
    document_id: str
    question: str = Field(min_length=2, max_length=2000)
    history: list[dict[str, str]] = Field(default_factory=list, max_length=12)


class StudyBody(BaseModel):
    document_id: str
    topic: str | None = Field(default=None, max_length=160)
    count: int = Field(default=8, ge=3, le=15)
    difficulty: Literal["gentle", "balanced", "stretch"] = "balanced"


def tokenize(text: str) -> list[str]:
    return [w for w in re.findall(r"[a-zA-Z0-9][a-zA-Z0-9'-]*", text.lower()) if w not in STOP_WORDS and len(w) > 1]


def make_chunks(text: str, page: int) -> list[Chunk]:
    words = text.split()
    out = []
    step = CHUNK_WORDS - CHUNK_OVERLAP
    for start in range(0, len(words), step):
        part = " ".join(words[start:start + CHUNK_WORDS]).strip()
        if len(part) > 60:
            out.append(Chunk(part, page, tokenize(part)))
        if start + CHUNK_WORDS >= len(words):
            break
    return out


def retrieve(doc: StudyDoc, query: str, limit: int = 5) -> list[Chunk]:
    terms = tokenize(query)
    if not terms:
        return doc.chunks[:limit]
    frequencies = doc.term_frequencies
    scores: list[tuple[float, Chunk]] = []
    for chunk, tf in zip(doc.chunks, frequencies):
        score = 0.0
        length = len(chunk.terms)
        for term in set(terms):
            df = doc.document_frequency[term]
            idf = math.log(1 + (len(doc.chunks) - df + 0.5) / (df + 0.5))
            freq = tf[term]
            score += idf * (freq * 2.2) / (freq + 1.2 * (0.25 + 0.75 * length / max(doc.average_length, 1)))
        if score:
            scores.append((score, chunk))
    scores.sort(key=lambda pair: pair[0], reverse=True)
    return [chunk for _, chunk in scores[:limit]] or doc.chunks[:limit]


def get_doc(document_id: str) -> StudyDoc:
    doc = documents.get(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="That study file is no longer available. Upload it again to continue.")
    return doc


async def groq(system: str, user: str, temperature: float = 0.35) -> str:
    key = os.getenv("GROQ_API_KEY", "").strip()
    if not key:
        raise HTTPException(status_code=503, detail="Add your GROQ_API_KEY to backend/.env, then restart the backend.")
    model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    payload = {
        "model": model,
        "temperature": temperature,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    }
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post("https://api.groq.com/openai/v1/chat/completions", headers={"Authorization": f"Bearer {key}"}, json=payload)
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"].strip()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Groq request failed ({exc.response.status_code}). Check your API key and model setting.") from exc
    except (httpx.HTTPError, KeyError, IndexError) as exc:
        raise HTTPException(status_code=502, detail="Could not reach Groq. Please try again in a moment.") from exc


@app.get("/api/health")
async def health():
    return {"status": "ok", "groq_configured": bool(os.getenv("GROQ_API_KEY", "").strip())}


@app.post("/api/documents")
async def upload_document(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Please choose a PDF file.")
    raw = await file.read(MAX_PDF_BYTES + 1)
    if len(raw) > MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail="This PDF is larger than 20 MB. Try a smaller file.")
    try:
        pdf = fitz.open(stream=raw, filetype="pdf")
        if pdf.is_encrypted:
            raise HTTPException(status_code=400, detail="This PDF is password protected. Unlock it and try again.")
        if len(pdf) > 500:
            pdf.close()
            raise HTTPException(status_code=413, detail="This PDF is longer than 500 pages. Try uploading one chapter at a time.")
        chunks: list[Chunk] = []
        for page_num, page in enumerate(pdf, start=1):
            chunks.extend(make_chunks(page.get_text("text"), page_num))
        page_count = len(pdf)
        pdf.close()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail="We couldn't read that PDF. Please try another file.") from exc
    if not chunks:
        raise HTTPException(status_code=422, detail="No selectable text found. This may be a scanned PDF; run OCR and upload it again.")
    doc_id = str(uuid.uuid4())
    doc_frequency = Counter(term for chunk in chunks for term in set(chunk.terms))
    average_length = sum(len(chunk.terms) for chunk in chunks) / len(chunks)
    term_frequencies = [Counter(chunk.terms) for chunk in chunks]
    doc = StudyDoc(doc_id, file.filename, page_count, chunks, term_frequencies, doc_frequency, average_length)
    documents[doc_id] = doc
    return {"id": doc.id, "name": doc.name, "pages": doc.pages, "chunks": len(chunks), "message": "Your notes are ready to explore."}


@app.delete("/api/documents/{document_id}")
async def delete_document(document_id: str):
    documents.pop(document_id, None)
    return {"ok": True}


@app.post("/api/ask")
async def ask(body: AskBody):
    doc = get_doc(body.document_id)
    hits = retrieve(doc, body.question, 5)
    context = "\n\n".join(f"[Page {c.page}] {c.text}" for c in hits)
    history = "\n".join(f"{m.get('role', 'user')}: {m.get('content', '')[:1200]}" for m in body.history[-6:])
    prompt = f"STUDY MATERIAL EXCERPTS:\n{context}\n\nRECENT CHAT:\n{history or '(none)'}\n\nSTUDENT QUESTION:\n{body.question}\n\nAnswer clearly and helpfully. Ground factual claims in the excerpts; if the material doesn't contain the answer, say so and distinguish general context. Cite relevant pages as [p. N]. Use concise headings or bullets when useful."
    answer = await groq("You are StudyFlow, a warm and precise study tutor. Teach for understanding, explain jargon simply, and never invent what the uploaded material says.", prompt)
    return {"answer": answer, "sources": sorted(set(c.page for c in hits))}


@app.post("/api/summary")
async def summary(body: StudyBody):
    doc = get_doc(body.document_id)
    topic = body.topic or "the main ideas across this document"
    hits = retrieve(doc, topic, 12)
    context = "\n\n".join(f"[Page {c.page}] {c.text}" for c in hits)
    result = await groq("You are a study coach. Turn course material into clear, accurate revision notes. Use only the supplied excerpts and cite page numbers.", f"Create a useful topic-wise summary for: {topic}\n\nMaterial:\n{context}\n\nFormat: a one-sentence overview, 3–6 topic headings with short explanations, then a 'Remember' section with 3 key takeaways. Cite pages like [p. 2].", 0.25)
    return {"summary": result, "sources": sorted(set(c.page for c in hits)), "topic": body.topic}


@app.post("/api/quiz")
async def quiz(body: StudyBody):
    doc = get_doc(body.document_id)
    topic = body.topic or "the most important ideas in this document"
    hits = retrieve(doc, topic, 12)
    context = "\n\n".join(f"[Page {c.page}] {c.text}" for c in hits)
    result = await groq(
        "You create rigorous but fair study quizzes from supplied source material. Return valid JSON only, no markdown fences, with shape: {\"title\": string, \"questions\": [{\"question\": string, \"options\": [string, string, string, string], \"answer\": integer (0-3), \"explanation\": string, \"page\": integer}]}. Make every correct answer unambiguous and ground it in the source.",
        f"Create {body.count} {body.difficulty} multiple-choice questions about {topic}. Material:\n{context}\nReturn JSON only.", 0.45)
    import json
    try:
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", result.strip(), flags=re.I)
        parsed = json.loads(cleaned)
        questions = parsed["questions"][:body.count]
        for q in questions:
            if len(q["options"]) != 4 or q["answer"] not in range(4):
                raise ValueError("Invalid quiz shape")
        return {"title": parsed.get("title", f"{topic} · practice set"), "questions": questions}
    except (ValueError, TypeError, KeyError) as exc:
        raise HTTPException(status_code=502, detail="The quiz response came back in an unexpected format. Try generating it again.") from exc


# In local single-server mode, serve the built React app from the same origin
# as the API. This avoids browser CORS and forwarded-port issues.
frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if frontend_dist.is_dir():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
