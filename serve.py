import http.server, socketserver, os
from pathlib import Path

WEB_DIR = r"C:\Users\kelvin\Downloads\brats_web"
os.chdir(WEB_DIR)

PORT = 8000

class Handler(http.server.SimpleHTTPRequestHandler):

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving: http://127.0.0.1:{PORT}/index.html")
    httpd.serve_forever()
