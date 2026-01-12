
Start-Job -ScriptBlock {
    C:\Users\Lamont\Desktop\dungeoncrawler\backend\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
} -Name "UvicornServer" | Out-Null
Start-Sleep -Seconds 5 # Give uvicorn some time to start
