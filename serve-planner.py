"""GEN2 planner dev server - http.server with caching disabled.

Chrome's heuristic cache happily serves STALE css/js from a plain
`python -m http.server` (it sends no Cache-Control header), which shows up
during local dev as "my app.js edit does nothing" - a new nav link rendering
unstyled, a constant that keeps its old value. `Cache-Control: no-store` makes
every load fresh. GitHub Pages deploys are fine without it.

Mirrors serve-viewer.py in the GEN2 Visual Animator repo.

Run:  python serve-planner.py            (or double-click serve-planner.bat)
      python serve-planner.py 8124       # port override
"""
import functools
import http.server
import os
import sys


class NoStoreHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8124
    root = os.path.dirname(os.path.abspath(__file__))
    handler = functools.partial(NoStoreHandler, directory=root)
    print(f"Serving GEN2 planner (no-store) at http://localhost:{port}/  (Ctrl+C to stop)")
    http.server.ThreadingHTTPServer(("", port), handler).serve_forever()
