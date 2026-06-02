; ============================================================
; AUDITCHECK — Windows Installer Script (NSIS)
; Requiere NSIS 3.x: https://nsis.sf.net
;
; Uso desde build_dist.ps1 (automático), o manual:
;   makensis /DVERSION=1.1.0 /DDIST_DIR=..\dist\AUDITCHECK_v1.1.0 setup.nsi
; ============================================================

Unicode True

; ── Variables por defecto (sobreescribibles con /D) ─────────────────────────
!ifndef VERSION
  !define VERSION "1.1.0"
!endif
!ifndef DIST_DIR
  !define DIST_DIR "..\dist\AUDITCHECK_v${VERSION}"
!endif

!define APP_NAME      "AUDITCHECK"
!define APP_VERSION   "${VERSION}"
!define APP_PUBLISHER "AuditCheck"
!define APP_URL       "https://github.com/Edu-Estevez-Lemes/auditcheck"

; Instalación en LOCALAPPDATA (sin necesidad de administrador)
!define INSTALL_DIR   "$LOCALAPPDATA\AuditCheck"

!define UNINSTALL_REG "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
!define OUT_FILE      "..\dist\AUDITCHECK_v${VERSION}_Setup.exe"

; ── NSIS includes ────────────────────────────────────────────────────────────
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

; ── Configuración del instalador ─────────────────────────────────────────────
Name              "${APP_NAME} v${APP_VERSION}"
OutFile           "${OUT_FILE}"
InstallDir        "${INSTALL_DIR}"
InstallDirRegKey  HKCU "Software\${APP_NAME}" "InstallDir"
RequestExecutionLevel user    ; NO requiere administrador
BrandingText      "${APP_NAME} v${APP_VERSION}"
SetCompressor     /SOLID lzma
SetCompressorDictSize 32

; ── Páginas del instalador ───────────────────────────────────────────────────
!define MUI_WELCOMEPAGE_TITLE    "Bienvenido a AUDITCHECK v${APP_VERSION}"
!define MUI_WELCOMEPAGE_TEXT     "Este asistente instalará AUDITCHECK en tu equipo.$\r$\n$\r$\nNo se requieren permisos de administrador.$\r$\n$\r$\nHaz clic en Siguiente para continuar."
!define MUI_DIRECTORYPAGE_TEXT_TOP "Elige la carpeta donde se instalará AUDITCHECK:"
!define MUI_FINISHPAGE_RUN       "$INSTDIR\AUDITCHECK.bat"
!define MUI_FINISHPAGE_RUN_TEXT  "Iniciar AUDITCHECK ahora"
!define MUI_FINISHPAGE_LINK      "Repositorio en GitHub"
!define MUI_FINISHPAGE_LINK_LOCATION "${APP_URL}"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "Spanish"

; ── Sección principal de instalación ─────────────────────────────────────────
Section "AUDITCHECK" SecMain
    SectionIn RO  ; obligatoria, no puede deseleccionarse

    SetOutPath "$INSTDIR"

    ; Copiar todos los archivos desde la carpeta de distribución
    File /r "${DIST_DIR}\*.*"

    ; Crear directorio de datos si no existe (para actualizaciones)
    CreateDirectory "$INSTDIR\data"
    CreateDirectory "$INSTDIR\assets\branding"

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
