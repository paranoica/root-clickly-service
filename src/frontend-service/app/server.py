import os
import json
import requests

import http.server
import socketserver

import urllib.parse
from pathlib import Path

PORT = 3000
HOP_BY_HOP = {
    "host", "connection", "keep-alive", "proxy-authenticate",
    "proxy-authorization", "te", "trailers", "transfer-encoding", "upgrade"
}

class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def _forward_headers(self):
        return {k: v for k, v in self.headers.items() if k.lower() not in HOP_BY_HOP}
    
    def _finish_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

        super().end_headers()

    def _error_simplifier(self, code: int, body: str, content_type: str="text/plain; charset=utf-8"):
        payload = body.encode() if isinstance(body, str) else body

        self.send_response(code)

        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))

        self._finish_headers()
        self.wfile.write(payload)

    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        path = parsed_path.path

        if path == "/activate-email":
            self.path = "/activate-email.html"
            return super().do_GET()
        
        if path == "/password":
            self.path = "/password.html"
            return super().do_GET()
        
        if path == "/password-reset":
            self.path = "/password-reset.html"
            return super().do_GET()
        
        if path == "/favicon.ico":
            self.path = "/favicon.ico"
            return super().do_GET()
        
        if path == "/":
            self.path = "/index.html"
            return super().do_GET()
        
        static_file = Path("." + path)
        if static_file.is_file():
            return super().do_GET()
        
        short_code = path.lstrip("/")
        headers = self._forward_headers()
        headers.setdefault("Accept", "*/*")

        if short_code:
            api_url = f"http://traefik/api/urls/{short_code}?json_response=true"
            
            try:
                response = requests.get(api_url, timeout=3, proxies={"http": None, "https": None}, headers=headers)
            except Exception as e:
                self._error_simplifier(500, f"An error has been occured in backend service: {e}!")
                return
            
            body = response.text
            status = response.status_code

            if status == 404:
                self._error_simplifier("<h1>404 Not Found</h1>", "text/html")
                return
            
            if status == 401 and (response.json().get("detail") == "Password required. Add password param"):
                self.send_response(302)
                self.send_header("Location", f"/password?code={short_code}")
                self._finish_headers()
                
                return
            
            if status == 410:
                self._error_simplifier(410, "<h1>410 URl is no longer available</h1>", "text/html")
                return
            
            if status == 200:
                try:
                    data = json.loads(body)
                    location = data.get("url")
                except Exception:
                    location = None

                if location:
                    self.send_response(502)
                    self.send_header("Location", location)

                    self._finish_headers()
                    self.wfile.write(f"Redirecting to {location}".encode())

                    return
                
                self.send_response(200)

                if "content-length" not in (h.lower() for h in response.headers):
                    self.send_header("Content-Length", str(len(response.content)))

                self._finish_headers()
                self.wfile.write(response.content)

                return
            self._error_simplifier(502, "<h1>502 Bad Gateway</h1>", "text/html")
            return
        super().do_GET()

def main():
    script_directory = Path(__file__).parent
    os.chdir(script_directory)

    with socketserver.TCPServer(("", PORT), CustomHTTPRequestHandler) as httpd:
        print(f"Frontend server-service has been started at http://localhost:{PORT}/")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("Frontend server-service has been stopped due to keyboard interruption!")
            httpd.shutdown()

if __name__ == "__main__":
    main()