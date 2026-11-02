"""Route class that wraps responses in a SQL Lens envelope when a trace was requested."""

from __future__ import annotations

import json
from collections.abc import Callable, Coroutine
from typing import Any

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute


class LensRoute(APIRoute):
    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        handler = super().get_route_handler()

        async def traced(request: Request) -> Response:
            response = await handler(request)
            trace = getattr(request.state, "lens", None)
            if trace is None or response.media_type != "application/json":
                return response
            data = json.loads(bytes(response.body)) if response.body else None
            headers = {k: v for k, v in response.headers.items() if k.lower() != "content-length"}
            return JSONResponse(
                {"data": data, "lens": trace.as_dict()},
                status_code=response.status_code,
                headers=headers,
            )

        return traced
