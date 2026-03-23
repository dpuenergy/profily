' Spusti AI proxy server na pozadi a otevri aplikaci v prohlizeci
' Dvojklikem spusti bez viditelneho okna terminaluOption Explicit
Dim ws, scriptDir
Set ws = CreateObject("WScript.Shell")
scriptDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))

' Spust Node.js server na pozadi (0 = skryte okno)
ws.Run "node """ & scriptDir & "ai-proxy\server.js""", 0, False

' Pockej 2 sekundy nez se server nastartuje
WScript.Sleep 2000

' Otevri aplikaci v prohlizeci
ws.Run """" & scriptDir & "web\index.html"""

Set ws = Nothing
