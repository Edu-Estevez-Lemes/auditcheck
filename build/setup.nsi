; ============================================================
; AUDITCHECK — Windows Installer Script (NSIS 3.x)
;
; Uso desde build_dist.ps1 (automático), o manual:
;   makensis /DVERSION=1.4.12 /DDIST_DIR=..\dist\AUDITCHECK_v1.4.12 setup.nsi
; ============================================================

Unicode True

; ── Variables por defecto (sobreescribibles con /D) ─────────────────────────
!ifndef VERSION
  !define VERSION "1.4.12"
!endif
!ifndef DIST_DIR
  !define DIST_DIR "..\dist\AUDITCHECK_v${VERSION}"
!endif

!define APP_NAME      "AUDITCHECK"
!define APP_VERSION   "${VERSION}"
!define APP_PUBLISHER "Laberit"
!define APP_URL       "https://github.com/Edu-Estevez-Lemes/auditcheck"

; Instalación en LOCALAPPDATA (sin necesidad de administrador)
!define INSTALL_DIR   "$LOCALAPPDATA\AuditCheck"

!define UNINSTALL_REG "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
!define OUT_FILE      "..\dist\AUDITCHECK_v${VERSION}_Setup.exe"

; ── NSIS includes ────────────────────────────────────────────────────────────
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"

; ── Variables globales ────────────────────────────────────────────────────────
Var PortDialog
Var PortLabel
Var PortField
Var PortValue
Var PortNote

; ── Configuración del instalador ─────────────────────────────────────────────
Name              "${APP_NAME} v${APP_VERSION}"
OutFile           "${OUT_FILE}"
InstallDir        "${INSTALL_DIR}"
InstallDirRegKey  HKCU "Software\${APP_NAME}" "InstallDir"
RequestExecutionLevel user    ; NO requiere administrador
BrandingText      "${APP_NAME} v${APP_VERSION} — Laberit"
SetCompressor     /SOLID lzma
SetCompressorDictSize 32

; ── Páginas del instalador ───────────────────────────────────────────────────
!define MUI_WELCOMEPAGE_TITLE    "Bienvenido a AUDITCHECK v${APP_VERSION}"
!define MUI_WELCOMEPAGE_TEXT     "Este asistente instalará AUDITCHECK en tu equipo.$\r$\n$\r$\nNo se requieren permisos de administrador.$\r$\n$\r$\nHaz clic en Siguiente para continuar."
!define MUI_DIRECTORYPAGE_TEXT_TOP "Elige la carpeta donde se instalará AUDITCHECK:$\r$\n(por defecto en tu perfil de usuario, sin necesidad de administrador)"
!define MUI_FINISHPAGE_RUN       "$INSTDIR\AUDITCHECK.bat"
!define MUI_FINISHPAGE_RUN_TEXT  "Iniciar AUDITCHECK ahora"
!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\LEEME.txt"
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Ver instrucciones de uso"
!define MUI_FINISHPAGE_LINK      "Repositorio en GitHub"
!define MUI_FINISHPAGE_LINK_LOCATION "${APP_URL}"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
Page custom PortPage PortPageLeave
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "Spanish"

; ── Página personalizada: Puerto ─────────────────────────────────────────────
Function PortPage
  !insertmacro MUI_HEADER_TEXT "Configuración del servidor" "Puerto de escucha de AUDITCHECK"

  nsDialogs::Create 1018
  Pop $PortDialog
  ${If} $PortDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 20u "Puerto TCP en el que AUDITCHECK estará disponible:$\r$\n(Deja el valor por defecto salvo que el puerto 8000 ya esté en uso)"
  Pop $PortLabel

  ${NSD_CreateNumber} 0 28u 80u 14u "8000"
  Pop $PortField

  ${NSD_CreateLabel} 85u 30u 100% 12u "  (rango válido: 1024 – 65535)"
  Pop $PortNote

  nsDialogs::Show
FunctionEnd

Function PortPageLeave
  ${NSD_GetText} $PortField $PortValue
  ; Validar que sea numérico y esté en rango
  ${If} $PortValue == ""
    StrCpy $PortValue "8000"
  ${EndIf}
  IntCmp $PortValue 1024 +2 0 +2
    MessageBox MB_OK|MB_ICONEXCLAMATION "El puerto debe ser mayor que 1024. Se usará 8000."
    StrCpy $PortValue "8000"
  IntCmp $PortValue 65535 +2 +2 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "El puerto debe ser menor que 65535. Se usará 8000."
    StrCpy $PortValue "8000"
FunctionEnd

; ── Sección principal de instalación ─────────────────────────────────────────
Section "AUDITCHECK" SecMain
    SectionIn RO  ; obligatoria, no puede deseleccionarse

    SetOutPath "$INSTDIR"

    ; Copiar todos los archivos desde la carpeta de distribución
    File /r "${DIST_DIR}\*.*"

    ; Crear directorio de datos si no existe (para actualizaciones)
    CreateDirectory "$INSTDIR\data"
    CreateDirectory "$INSTDIR\assets\branding"

    ; Escribir el puerto en .env si el usuario eligió uno distinto de 8000
    ${If} $PortValue != "8000"
    ${AndIf} $PortValue != ""
      FileOpen $0 "$INSTDIR\.env" w
      FileWrite $0 "AUDITCHECK_PORT=$PortValue$\r$\n"
      FileClose $0
    ${EndIf}

    ; ── Accesos directos ────────────────────────────────────────────────────
    CreateShortCut "$DESKTOP\${APP_NAME}.lnk" \
        "$INSTDIR\AUDITCHECK.bat" "" \
        "$INSTDIR\AUDITCHECK.bat" 0 SW_SHOWMINNOACTIVE

    CreateDirectory "$SMPROGRAMS\${APP_NAME}"
    CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" \
        "$INSTDIR\AUDITCHECK.bat" "" \
        "$INSTDIR\AUDITCHECK.bat" 0 SW_SHOWMINNOACTIVE
    CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_NAME} (consola).lnk" \
        "$INSTDIR\AUDITCHECK_consola.bat"
    CreateShortCut "$SMPROGRAMS\${APP_NAME}\Desinstalar ${APP_NAME}.lnk" \
        "$INSTDIR\Desinstalar.exe"

    ; ── Registro para Agregar/Quitar programas ───────────────────────────────
    WriteRegStr   HKCU "${UNINSTALL_REG}" "DisplayName"     "${APP_NAME} v${APP_VERSION}"
    WriteRegStr   HKCU "${UNINSTALL_REG}" "DisplayVersion"  "${APP_VERSION}"
    WriteRegStr   HKCU "${UNINSTALL_REG}" "Publisher"       "${APP_PUBLISHER}"
    WriteRegStr   HKCU "${UNINSTALL_REG}" "URLInfoAbout"    "${APP_URL}"
    WriteRegStr   HKCU "${UNINSTALL_REG}" "InstallLocation" "$INSTDIR"
    WriteRegStr   HKCU "${UNINSTALL_REG}" "UninstallString" '"$INSTDIR\Desinstalar.exe"'
    WriteRegDWORD HKCU "${UNINSTALL_REG}" "NoModify" 1
    WriteRegDWORD HKCU "${UNINSTALL_REG}" "NoRepair"  1

    ; Tamaño estimado (en KB) para Agregar/Quitar programas
    ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
    IntFmt $0 "0x%08X" $0
    WriteRegDWORD HKCU "${UNINSTALL_REG}" "EstimatedSize" "$0"

    WriteRegStr HKCU "Software\${APP_NAME}" "InstallDir" "$INSTDIR"
    WriteRegStr HKCU "Software\${APP_NAME}" "Version"    "${APP_VERSION}"

    ; Crear desinstalador
    WriteUninstaller "$INSTDIR\Desinstalar.exe"
SectionEnd

; ── Sección de desinstalación ─────────────────────────────────────────────────
Section "Uninstall"
    ; Preguntar si conservar datos (BD, credenciales)
    MessageBox MB_YESNO|MB_ICONQUESTION \
        "¿Deseas conservar los datos de AUDITCHECK?$\r$\n$\r$\n\
        (Base de datos, credenciales y configuración en '$INSTDIR\data\')" \
        IDYES keep_data

    ; Eliminar también datos
    RMDir /r "$INSTDIR\data"
    keep_data:

    ; Eliminar archivos de la aplicación (respetando data\ si se eligió conservar)
    RMDir /r "$INSTDIR\python"
    RMDir /r "$INSTDIR\app"
    RMDir /r "$INSTDIR\frontend_dist"
    RMDir /r "$INSTDIR\assets"
    Delete   "$INSTDIR\launcher.py"
    Delete   "$INSTDIR\AUDITCHECK.bat"
    Delete   "$INSTDIR\AUDITCHECK_consola.bat"
    Delete   "$INSTDIR\Instalar_accesos.bat"
    Delete   "$INSTDIR\Desinstalar_accesos.bat"
    Delete   "$INSTDIR\LEEME.txt"
    Delete   "$INSTDIR\.env"
    Delete   "$INSTDIR\.env.example"
    Delete   "$INSTDIR\Desinstalar.exe"
    RMDir    "$INSTDIR"   ; elimina si quedó vacía

    ; Eliminar accesos directos
    Delete "$DESKTOP\${APP_NAME}.lnk"
    RMDir /r "$SMPROGRAMS\${APP_NAME}"

    ; Limpiar registro
    DeleteRegKey HKCU "${UNINSTALL_REG}"
    DeleteRegKey HKCU "Software\${APP_NAME}"
SectionEnd
