import os
import json
from typing import Any
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


class DoubaoTextClient:
    def __init__(self, api_key: str | None = None, base_url: str = "https://ark.cn-beijing.volces.com/api/v3", model: str = "doubao-seed-1-6-251015"):
        self.api_key = api_key or os.getenv("ARK_API_KEY") or ""
        self.base_url = base_url.rstrip("/")
        self.model = model

    def generate(self, messages: list[dict[str, Any]], system: str | None = None, user: str | None = None, stream: bool | None = False) -> dict:
        payload_messages = []
        if system:
            payload_messages.append({"role": "system", "content": system})
        payload_messages.extend(messages)
        payload: dict = {"model": self.model, "messages": payload_messages}
        if user is not None:
            payload["user"] = user
        if stream is not None:
            payload["stream"] = stream

        data = json.dumps(payload).encode("utf-8")
        req = Request(
            f"{self.base_url}/chat/completions",
            data=data,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
            method="POST",
        )
        try:
            with urlopen(req) as resp:
                body = resp.read().decode("utf-8")
                return json.loads(body)
        except HTTPError as e:
            err_body = e.read().decode("utf-8") if hasattr(e, "read") else ""
            raise RuntimeError(f"DoubaoTextClient HTTPError {e.code}: {err_body}")
        except URLError as e:
            raise RuntimeError(f"DoubaoTextClient URLError: {e.reason}")

