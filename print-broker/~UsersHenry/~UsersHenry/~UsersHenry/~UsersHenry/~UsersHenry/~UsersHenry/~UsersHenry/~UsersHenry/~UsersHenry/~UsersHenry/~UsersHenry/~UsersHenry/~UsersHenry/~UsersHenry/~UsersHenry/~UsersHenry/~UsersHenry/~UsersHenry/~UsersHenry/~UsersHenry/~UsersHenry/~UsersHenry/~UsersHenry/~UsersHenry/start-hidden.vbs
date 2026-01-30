Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c node dist/index.js", 0, False
