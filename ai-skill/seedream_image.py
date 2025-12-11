import os
import json
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


class SeedreamImageClient:
    def __init__(self, api_key: str | None = None, base_url: str = "https://ark.cn-beijing.volces.com/api/v3", model: str = "doubao-seedream-4-5-251128"):
        self.api_key = api_key or os.getenv("ARK_API_KEY") or ""
        self.base_url = base_url.rstrip("/")
        self.model = model

    def generate(self, prompt: str, image: str | list[str] | None = None, size: str | None = None, sequential_image_generation: str | None = "disabled", stream: bool | None = False, response_format: str | None = "url", watermark: bool | None = None) -> dict:
        payload: dict = {"model": self.model, "prompt": prompt}
        if image is not None:
            payload["image"] = image
        if size is not None:
            payload["size"] = size
        if sequential_image_generation is not None:
            payload["sequential_image_generation"] = sequential_image_generation
        if stream is not None:
            payload["stream"] = stream
        if response_format is not None:
            payload["response_format"] = response_format
        if watermark is not None:
            payload["watermark"] = watermark

        data = json.dumps(payload).encode("utf-8")
        req = Request(
            f"{self.base_url}/images/generations",
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
            raise RuntimeError(f"SeedreamImageClient HTTPError {e.code}: {err_body}")
        except URLError as e:
            raise RuntimeError(f"SeedreamImageClient URLError: {e.reason}")

