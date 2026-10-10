#!/usr/bin/env python3
"""DrapOG 开发服务器（方案 B：从 _dev/ 启动，根指向 DrapOG/）"""
import http.server
import socketserver
import sys
import os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

# 切到 DrapOG/ 根目录
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        print(f"  {self.address_string()} - {fmt % args}")

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print()
    print("  DrapOG 开发服务器已启动")
    print(f"  根目录: {ROOT}")
    print(f"  地址:   http://localhost:{PORT}/_dev/")
    print("  停止:   Ctrl+C")
    print()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")