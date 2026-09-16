' Install Jira Plus.vbs - double-click this from the team folder.
'
' It copies Jira+ from wherever this file sits - a Teams channel folder synced
' by OneDrive, a network share, an extracted zip - into a private folder on this
' machine, adds "Jira Plus" to the Start Menu, and starts it. Run it again when
' a newer version appears in the team folder: the new version is installed
' beside the old one and the pointer moved, exactly as the in-app updater does.
'
' Why copy rather than run in place: the shared folder is shared. A running
' executable and a version pointer inside a synced library would be fought over
' by the sync client and by everybody else who opened it. Each person needs
' their own copy, and this makes that one double-click instead of a page of
' instructions.
'
' Why %LOCALAPPDATA% rather than Documents: corporate Windows commonly redirects
' Documents into OneDrive, which is the same problem in a different folder.
' %LOCALAPPDATA% is never synced and never needs administrator rights.
'
' /testroot:<folder> redirects the install and Start Menu folders under one
' scratch folder, prints instead of showing dialogs, and does not launch. It is
' the single seam the automated test uses; nobody else needs it.

Option Explicit

' -- Configuration --------------------------------------------------------------

Const INSTALL_FOLDER_NAME = "JiraPlus"
Const CURRENT_POINTER_FILENAME = "current.txt"
Const VERSIONS_DIRECTORY_NAME = "versions"
Const PAYLOAD_EXE_FILENAME = "jiraplus.exe"
Const LAUNCHER_FILENAME = "Launch Jira Plus.vbs"
Const SHORTCUT_FILENAME = "Jira Plus.lnk"
Const TEST_ROOT_ARGUMENT = "testroot"
Const TEST_START_MENU_FOLDER_NAME = "Start Menu"

' The same port the launchers use. A running copy is asked to stop before the
' pointer moves, so the next launch starts the new version rather than reopening
' the old one.
Const SERVER_PORT = 5556

Const MSGBOX_ERROR = 16
Const MSGBOX_INFORMATION = 64
Const FILE_OVERWRITE = True

' The small files that travel with every version. Overwritten on every install,
' because a launcher fix should reach people without a new executable.
Const COMPANION_FILENAMES = "Launch Jira Plus.vbs|Launch Jira Plus (show errors).bat|Stop Jira Plus.vbs|README.txt|SHA256SUMS.txt"

' -- Entry point ----------------------------------------------------------------

Dim objFSO, objShell, testRoot

Set objFSO = CreateObject("Scripting.FileSystemObject")
Set objShell = CreateObject("WScript.Shell")
testRoot = WScript.Arguments.Named(TEST_ROOT_ARGUMENT)

Main

Set objShell = Nothing
Set objFSO = Nothing

Sub Main()
    Dim sourceRoot, sourceVersion, installRoot
    sourceRoot = objFSO.GetParentFolderName(WScript.ScriptFullName)
    sourceVersion = ReadPointer(sourceRoot)

    If sourceVersion = "" Or Not objFSO.FileExists(BuildPayloadPath(sourceRoot, sourceVersion)) Then
        ReportProblem "Jira+ could not find the program to install." & vbNewLine & vbNewLine & _
                      "Expected current.txt and versions\<version>\" & PAYLOAD_EXE_FILENAME & " in:" & vbNewLine & _
                      sourceRoot & vbNewLine & vbNewLine & _
                      "This file has to sit in the folder the release was extracted to."
        WScript.Quit 1
    End If

    installRoot = ResolveInstallRoot()
    If LCase(installRoot) = LCase(sourceRoot) Then
        ReportProblem "This folder IS the installed copy." & vbNewLine & vbNewLine & _
                      "Double-click '" & LAUNCHER_FILENAME & "' to start Jira+."
        WScript.Quit 1
    End If

    InstallVersion sourceRoot, installRoot, sourceVersion
    CopyCompanions sourceRoot, installRoot
    Dim selectedVersion
    selectedVersion = SelectVersion(installRoot, sourceVersion)
    CreateStartMenuShortcut installRoot

    If IsTestRun() Then
        WScript.Echo "Installed " & sourceVersion & " to " & installRoot & "; running " & selectedVersion
        WScript.Quit 0
    End If

    objShell.Run "wscript.exe " & Chr(34) & objFSO.BuildPath(installRoot, LAUNCHER_FILENAME) & Chr(34), 0, False
End Sub

' -- Where things go -------------------------------------------------------------

Function IsTestRun()
    IsTestRun = (testRoot <> "")
End Function

Function ResolveInstallRoot()
    If IsTestRun() Then
        ResolveInstallRoot = objFSO.BuildPath(testRoot, INSTALL_FOLDER_NAME)
    Else
        ResolveInstallRoot = objFSO.BuildPath(objShell.ExpandEnvironmentStrings("%LOCALAPPDATA%"), INSTALL_FOLDER_NAME)
    End If
End Function

Function ResolveStartMenuFolder()
    If IsTestRun() Then
        ResolveStartMenuFolder = objFSO.BuildPath(testRoot, TEST_START_MENU_FOLDER_NAME)
    Else
        ' The current user's Programs folder: no administrator rights needed.
        ResolveStartMenuFolder = objShell.SpecialFolders("Programs")
    End If
End Function

Function BuildPayloadPath(rootFolder, versionText)
    BuildPayloadPath = objFSO.BuildPath( _
        objFSO.BuildPath(objFSO.BuildPath(rootFolder, VERSIONS_DIRECTORY_NAME), versionText), _
        PAYLOAD_EXE_FILENAME)
End Function

' -- The install itself ----------------------------------------------------------

' Copies one version's executable into place, skipping a version already there.
' A version folder is never rewritten: the executable in it may be the one
' running right now, and Windows would refuse the overwrite anyway.
Sub InstallVersion(sourceRoot, installRoot, versionText)
    Dim targetPath
    targetPath = BuildPayloadPath(installRoot, versionText)
    If objFSO.FileExists(targetPath) Then Exit Sub

    EnsureFolder objFSO.GetParentFolderName(targetPath)
    objFSO.CopyFile BuildPayloadPath(sourceRoot, versionText), targetPath, FILE_OVERWRITE
End Sub

Sub CopyCompanions(sourceRoot, installRoot)
    Dim companionName, sourcePath
    For Each companionName In Split(COMPANION_FILENAMES, "|")
        sourcePath = objFSO.BuildPath(sourceRoot, companionName)
        If objFSO.FileExists(sourcePath) Then
            objFSO.CopyFile sourcePath, objFSO.BuildPath(installRoot, companionName), FILE_OVERWRITE
        End If
    Next
End Sub

' Decides which version the local copy should run, and returns it.
'
' The pointer only ever moves FORWARD. Somebody who took an update from GitHub
' is ahead of the team folder, and re-running this must not downgrade them.
Function SelectVersion(installRoot, sourceVersion)
    Dim installedVersion
    installedVersion = ReadPointer(installRoot)

    If installedVersion <> "" And objFSO.FileExists(BuildPayloadPath(installRoot, installedVersion)) Then
        If CompareVersions(installedVersion, sourceVersion) >= 0 Then
            If CompareVersions(installedVersion, sourceVersion) > 0 Then
                ReportNotice "The installed version (" & installedVersion & ") is newer than the team folder's (" & _
                             sourceVersion & "). Keeping the newer one."
            End If
            SelectVersion = installedVersion
            Exit Function
        End If
        ' A version change: the running copy, if any, is asked to stop so the
        ' next launch starts the new one instead of reopening the old.
        AskRunningCopyToStop
    End If

    WritePointer installRoot, sourceVersion
    SelectVersion = sourceVersion
End Function

Sub CreateStartMenuShortcut(installRoot)
    Dim shortcutFolder, shortcut
    shortcutFolder = ResolveStartMenuFolder()
    EnsureFolder shortcutFolder

    Set shortcut = objShell.CreateShortcut(objFSO.BuildPath(shortcutFolder, SHORTCUT_FILENAME))
    shortcut.TargetPath = "wscript.exe"
    shortcut.Arguments = Chr(34) & objFSO.BuildPath(installRoot, LAUNCHER_FILENAME) & Chr(34)
    shortcut.WorkingDirectory = installRoot
    shortcut.Description = "Jira+"
    shortcut.Save
End Sub

' -- Helpers ---------------------------------------------------------------------

Sub EnsureFolder(folderPath)
    If objFSO.FolderExists(folderPath) Then Exit Sub
    EnsureFolder objFSO.GetParentFolderName(folderPath)
    objFSO.CreateFolder folderPath
End Sub

Function ReadPointer(rootFolder)
    Dim pointerPath, pointerFile
    pointerPath = objFSO.BuildPath(rootFolder, CURRENT_POINTER_FILENAME)
    ReadPointer = ""
    If Not objFSO.FileExists(pointerPath) Then Exit Function

    Set pointerFile = objFSO.OpenTextFile(pointerPath, 1, False)
    If Not pointerFile.AtEndOfStream Then ReadPointer = Trim(pointerFile.ReadLine)
    pointerFile.Close
End Function

Sub WritePointer(rootFolder, versionText)
    Dim pointerFile
    Set pointerFile = objFSO.OpenTextFile(objFSO.BuildPath(rootFolder, CURRENT_POINTER_FILENAME), 2, True)
    pointerFile.WriteLine versionText
    pointerFile.Close
End Sub

' Compares by version NUMBER rather than as text, so 0.10.0 outranks 0.9.9.
' Duplicated from the launcher because a .vbs file cannot include another.
Function CompareVersions(firstVersion, secondVersion)
    Dim firstParts, secondParts, partIndex, firstNumber, secondNumber
    firstParts = Split(Replace(firstVersion, "v", ""), ".")
    secondParts = Split(Replace(secondVersion, "v", ""), ".")
    CompareVersions = 0

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
End Function

Function ReadVersionPart(versionParts, partIndex)
    ReadVersionPart = 0
    If partIndex > UBound(versionParts) Then Exit Function
    If IsNumeric(versionParts(partIndex)) Then ReadVersionPart = CInt(versionParts(partIndex))
End Function

' Nothing listening is the ordinary case, not a fault: Jira+ was not running.
Sub AskRunningCopyToStop()
    Dim httpRequest
    On Error Resume Next
    Set httpRequest = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    httpRequest.SetTimeouts 1000, 1000, 2000, 2000
    httpRequest.Open "POST", "http://localhost:" & SERVER_PORT & "/api/instance/stop", False
    httpRequest.Send ""
    Err.Clear
    On Error GoTo 0
End Sub

' -- Talking to the person -------------------------------------------------------

Sub ReportProblem(messageText)
    If IsTestRun() Then
        WScript.Echo messageText
    Else
        MsgBox messageText, MSGBOX_ERROR, "Jira+ could not be installed"
    End If
End Sub

Sub ReportNotice(messageText)
    If IsTestRun() Then
        WScript.Echo messageText
    Else
        MsgBox messageText, MSGBOX_INFORMATION, "Jira+"
    End If
End Sub
