"""OpenRouter client — one function, used for every AI step."""
import os
import re
import json
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


def model() -> str:
    return os.getenv("OPENROUTER_MODEL", "anthropic/claude-sonnet-4.5")


def call_llm(system: str, user: str, json_mode: bool = False,
             max_tokens: int = 6000, temperature: float = 0.6):
    key = os.getenv("OPENROUTER_API_KEY")
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY missing — add it to gtm-agent/.env")
    r = requests.post(
        OPENROUTER_URL,
        headers={
            "Authorization": f"Bearer {key}",
            "HTTP-Referer": "http://localhost:8010",
            "X-Title": "Yomnita Partnerships Agent",
        },
        json={
            "model": model(),
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "max_tokens": max_tokens,
            "temperature": temperature,
        },
        timeout=240,
    )
    r.raise_for_status()
    data = r.json()
    if "choices" not in data or not data["choices"]:
        raise RuntimeError(f"OpenRouter returned no choices: {json.dumps(data)[:500]}")
    content = data["choices"][0]["message"]["content"]
    if json_mode:
        return extract_json(content)
    return content


def extract_json(text: str):
    """Pull the first JSON object out of a response (handles ```json fences)."""
    text = re.sub(r"```(?:json)?", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError(f"No JSON found in LLM response: {text[:300]}")
    return json.loads(text[start:end + 1])
