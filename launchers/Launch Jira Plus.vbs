' Launch Jira Plus.vbs — double-click this.
'
' It starts Jira+ hidden, waits for the port, and opens the dashboard in your
' default browser. No console window, no terminal, no Node.js required — the
' executable it starts carries its own runtime inside it.
'
' The launcher is deliberately stable across updates. A new version is installed
' under versions\<version> and current.txt is pointed at it, rather than the
' running executable being replaced — because Windows will not let you overwrite
' a file that is currently running, and an update that fails halfway leaves
' somebody with nothing.

Option Explicit

' ── Configuration ──────────────────────────────────────────────────────────────

' Deliberately not 5555, which NodeToolbox occupies. The two are meant to be
' open side by side while one is compared against the other.
Const SERVER_PORT = 5556
Const SERVER_READY_TIMEOUT_SECONDS = 30
Const POLL_INTERVAL_MS = 1000
Const CURRENT_POINTER_FILENAME = "current.txt"
Const VERSIONS_DIRECTORY_NAME = "versions"
Const PAYLOAD_EXE_FILENAME = "jiraplus.exe"

' ── Entry point ────────────────────────────────────────────────────────────────

Dim objFSO, objShell

Set objFSO = CreateObject("Scripting.FileSystemObject")
Set objShell = CreateObject("WScript.Shell")

Main

Set objShell = Nothing
Set objFSO = Nothing

Sub Main()
    Dim installRoot
    installRoot = objFSO.GetParentFolderName(WScript.ScriptFullName)

    Dim payloadPath
    payloadPath = ResolvePayloadPath(installRoot)

    If payloadPath = "" Then
        MsgBox "Jira+ could not find its program files." & vbNewLine & vbNewLine & _
               "Expected current.txt and versions\<version>\" & PAYLOAD_EXE_FILENAME & " in:" & vbNewLine & _
               installRoot & vbNewLine & vbNewLine & _
               "Extract the whole zip to one folder and try again — the launcher and the " & _
               "versions folder have to stay together.", _
               16, "Jira+ could not start"
        Exit Sub
    End If

    ' Started hidden. The window flashing open and shut is the commonest reason
    ' people believe a tool like this is broken when it is working.
    objShell.Run Chr(34) & payloadPath & Chr(34), 0, False

    If WaitForServerReady() Then
        objShell.Run "cmd /c start " & Chr(34) & Chr(34) & " " & _
                     Chr(34) & "http://localhost:" & SERVER_PORT & Chr(34), 0, False
    Else
        ShowStartupTimeout payloadPath
    End If
End Sub

' ── Finding the program ────────────────────────────────────────────────────────

Function ResolvePayloadPath(installRoot)
    Dim selectedVersion
    selectedVersion = ReadCurrentVersion(installRoot)

    If selectedVersion <> "" Then
        Dim selectedPath
        selectedPath = BuildPayloadPath(installRoot, selectedVersion)
        If objFSO.FileExists(selectedPath) Then
            ResolvePayloadPath = selectedPath
            Exit Function
        End If
    End If

    ' The pointer is missing or names a version that is not there. Fall back to
    ' the highest installed version and repair the pointer, so a half-finished
    ' update leaves somebody with a working application rather than none.
    Dim highestVersion
    highestVersion = FindHighestInstalledVersion(installRoot)

    If highestVersion <> "" Then
        WriteCurrentVersion installRoot, highestVersion
        ResolvePayloadPath = BuildPayloadPath(installRoot, highestVersion)
        Exit Function
    End If

    ResolvePayloadPath = ""
End Function

Function ReadCurrentVersion(installRoot)
    Dim pointerPath
    pointerPath = objFSO.BuildPath(installRoot, CURRENT_POINTER_FILENAME)

    If Not objFSO.FileExists(pointerPath) Then
        ReadCurrentVersion = ""
        Exit Function
    End If

    Dim pointerFile
    Set pointerFile = objFSO.OpenTextFile(pointerPath, 1, False)
    If pointerFile.AtEndOfStream Then
        ReadCurrentVersion = ""
    Else
        ReadCurrentVersion = Trim(pointerFile.ReadLine)
    End If
    pointerFile.Close
End Function

Sub WriteCurrentVersion(installRoot, versionText)
    On Error Resume Next
    Dim pointerPath, pointerFile
    pointerPath = objFSO.BuildPath(installRoot, CURRENT_POINTER_FILENAME)
    Set pointerFile = objFSO.OpenTextFile(pointerPath, 2, True)
    pointerFile.WriteLine versionText
    pointerFile.Close
    On Error GoTo 0
End Sub

Function BuildPayloadPath(installRoot, versionText)
    BuildPayloadPath = objFSO.BuildPath( _
        objFSO.BuildPath(objFSO.BuildPath(installRoot, VERSIONS_DIRECTORY_NAME), versionText), _
        PAYLOAD_EXE_FILENAME)
End Function

Function FindHighestInstalledVersion(installRoot)
    Dim versionsPath
    versionsPath = objFSO.BuildPath(installRoot, VERSIONS_DIRECTORY_NAME)

    If Not objFSO.FolderExists(versionsPath) Then
        FindHighestInstalledVersion = ""
        Exit Function
    End If

    Dim highestVersion, candidateFolder
    highestVersion = ""

    For Each candidateFolder In objFSO.GetFolder(versionsPath).SubFolders
        If objFSO.FileExists(BuildPayloadPath(installRoot, candidateFolder.Name)) Then
            If highestVersion = "" Or CompareVersions(candidateFolder.Name, highestVersion) > 0 Then
                highestVersion = candidateFolder.Name
            End If
        End If
    Next

    FindHighestInstalledVersion = highestVersion
End Function

' Compares by version NUMBER rather than by folder timestamp, because an update
' copied later is not necessarily a later version.
Function CompareVersions(firstVersion, secondVersion)
    Dim firstParts, secondParts, partIndex, firstNumber, secondNumber
    firstParts = Split(Replace(firstVersion, "v", ""), ".")
    secondParts = Split(Replace(secondVersion, "v", ""), ".")

    For partIndex = 0 To 2
        firstNumber = ReadVersionPart(firstParts, partIndex)
        secondNumber = ReadVersionPart(secondParts, partIndex)
        If firstNumber > secondNumber Then
            CompareVersions = 1
            Exit Function
        End If
        If firstNumber < secondNumber Then
            CompareVersions = -1
            Exit Function
        End If
    Next

    CompareVersions = 0
End Function

Function ReadVersionPart(versionParts, partIndex)
    If partIndex > UBound(versionParts) Then
        ReadVersionPart = 0
    ElseIf IsNumeric(versionParts(partIndex)) Then
        ReadVersionPart = CInt(versionParts(partIndex))
    Else
        ReadVersionPart = 0
    End If
End Function

' ── Waiting for the server ─────────────────────────────────────────────────────

Function WaitForServerReady()
    Dim pollAttempt
    WaitForServerReady = False

    For pollAttempt = 1 To SERVER_READY_TIMEOUT_SECONDS
        WScript.Sleep POLL_INTERVAL_MS
        If IsPortListening(SERVER_PORT) Then
            WaitForServerReady = True
            Exit Function
        End If
    Next
End Function

Function IsPortListening(portNumber)
    Dim checkExitCode
    checkExitCode = objShell.Run( _
        "cmd /c netstat -ano | findstr " & Chr(34) & "127.0.0.1:" & portNumber & Chr(34), _
        0, True)
    IsPortListening = (checkExitCode = 0)
End Function

Sub ShowStartupTimeout(payloadPath)
    MsgBox "Jira+ did not start within " & SERVER_READY_TIMEOUT_SECONDS & " seconds." & vbNewLine & vbNewLine & _
           "The likeliest causes, in order:" & vbNewLine & _
           "  " & Chr(149) & " Windows SmartScreen or antivirus blocked it. If you see a warning," & vbNewLine & _
           "    choose 'More info' then 'Run anyway'." & vbNewLine & _
           "  " & Chr(149) & " Port " & SERVER_PORT & " is already in use. Open Task Manager, end any" & vbNewLine & _
           "    'jiraplus' process, and try again." & vbNewLine & vbNewLine & _
           "To see the error for yourself, double-click 'Launch Jira Plus (show errors).bat'" & vbNewLine & _
           "in this folder — it does the same thing with the console visible.", _
           48, "Jira+ did not start"
End Sub
