
Start-Process -FilePath "C:\Users\Lamont\Desktop\dungeoncrawler\backend\venv\Scripts\python.exe" -ArgumentList "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000", "--reload" -RedirectStandardOutput "uvicorn_startup.log" -RedirectStandardError "uvicorn_startup.log" -NoNewWindow
