; Extra installer steps for Focus Study (included by electron-builder).

; Runs at the very start of the uninstaller, before anything is touched. Launches the already-installed app with
; --uninstall-gate, which shows a small window asking for the parent/admin unlock code and exits 0 only once it is
; entered correctly (or exits 0 straight away if no student has ever signed in on this install). Any other result
; (wrong code five times, or the window is closed) aborts the uninstall.
!macro customUnInit
  IfFileExists "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 +4
  ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --uninstall-gate' $0
  StrCmp $0 "0" +2
  Abort
!macroend

; Starts with Windows at sign-in (the app itself skips this inside administrator accounts, see main.js).
!macro customInstall
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "Focus Study" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --autostart'
!macroend

!macro customUnInstall
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "Focus Study"
!macroend
