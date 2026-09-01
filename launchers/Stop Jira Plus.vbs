' Stop Jira Plus.vbs — the way out.
'
' Jira+ runs hidden so no console window flashes up when it starts. The cost was
' that there was no window to close, and Task Manager was the only way to stop
' it. This is the answer to that.
'
' It asks the running copy to stop itself, which is cleaner than ending the
' process: the server closes its own listener and exits, rather than being cut
' off mid-request. There is also a Stop button inside the app, on the Setup
' screen, which does exactly the same thing.

Option Explicit

Const SERVER_PORT = 5556

Dim httpRequest, wasStopped
wasStopped = False

On Error Resume Next
Set httpRequest = CreateObject("MSXML2.ServerXMLHTTP.6.0")
httpRequest.SetTimeouts 2000, 2000, 5000, 5000
httpRequest.Open "POST", "http://localhost:" & SERVER_PORT & "/api/instance/stop", False
httpRequest.Send ""
If Err.Number = 0 And httpRequest.Status = 200 Then wasStopped = True
On Error GoTo 0

If wasStopped Then
    MsgBox "Jira+ has stopped." & vbNewLine & vbNewLine & _
           "Double-click 'Launch Jira Plus' to start it again.", _
           64, "Jira+ stopped"
Else
    ' Nothing answering on the port is the ordinary case here, not a fault:
    ' it means Jira+ was not running in the first place.
    MsgBox "Nothing was running on port " & SERVER_PORT & "." & vbNewLine & vbNewLine & _
           "Jira+ was already stopped.", _
           64, "Jira+ was not running"
End If
