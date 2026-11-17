import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description="Start the Fog Mirror browser preview.")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    with ThreadingHTTPServer(
        ("127.0.0.1", args.port),
        partial(SimpleHTTPRequestHandler, directory=str(ROOT / "app")),
    ) as server:
        print(f"Fog Mirror: http://127.0.0.1:{server.server_port}/ (Ctrl+C to stop)", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
