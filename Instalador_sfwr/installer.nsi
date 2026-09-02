; ============================================================
; AuditCheck - Instalador Windows (NSIS 3.x)
;
; Se compila con build_installer.ps1 (que descarga NSIS portable la
; primera vez, prepara el payload y llama a makensis.exe). No se
; ejecuta a mano salvo para depurar:
;   makensis /DVERSION=3.1.1 /DPUBLISHER=AuditCheck /DDIST_DIR=..\payload installer.nsi
; ============================================================

Unicode True

!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!ifndef PUBLISHER
  !define PUBLISHER "AuditCheck"
!endif
!ifndef DIST_DIR
  !define DIST_DIR ".payload"
!endif
; Superadmin predefinido (opcional): build_installer.ps1 genera un usuario y
; contraseña aleatorios UNICOS para cada .exe que compila y los pasa aqui via
; /D. Si se compila manualmente sin indicarlos, quedan vacios y la app cae al
; flujo normal de creacion manual del primer superadmin (Setup.tsx).
!ifndef SUPERADMIN_USER
  !define SUPERADMIN_USER ""
!endif
!ifndef SUPERADMIN_PASSWORD
  !define SUPERADMIN_PASSWORD ""
!endif

!define APP_NAME    "AuditCheck"
!define APP_VERSION "${VERSION}"
!define APP_URL     "https://github.com/Edu-Estevez-Lemes/auditcheck"
!define DEFAULT_ICON "${DIST_DIR}\assets\branding\icon.ico"

; Instalacion en LOCALAPPDATA: no requiere administrador
!define INSTALL_DIR "$LOCALAPPDATA\AuditCheck"

!define UNINSTALL_REG "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
!define OUT_FILE      "output\AuditCheck_v${VERSION}_Setup.exe"

; ── NSIS includes ────────────────────────────────────────────────────────────
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "WinVer.nsh"
!include "x64.nsh"

; ── Variables globales ────────────────────────────────────────────────────────
Var PortDialog
Var PortField
Var PortValue

Var LogoDialog
Var LogoField
Var LogoBrowse
Var LogoPath

Var HeaderField
Var AccentField
Var SeparatorField
Var HeaderColor
Var AccentColor
Var SeparatorColor
Var TmpColor

Var HeaderSwatch
Var AccentSwatch
Var SeparatorSwatch
Var CustomColorsBuf

; ── Configuracion del instalador ─────────────────────────────────────────────
Name              "${APP_NAME} v${APP_VERSION}"
OutFile           "${OUT_FILE}"
Icon              "${DEFAULT_ICON}"
UninstallIcon     "${DEFAULT_ICON}"
InstallDir        "${INSTALL_DIR}"
InstallDirRegKey  HKCU "Software\${APP_NAME}" "InstallDir"
RequestExecutionLevel user    ; NO requiere administrador
BrandingText      "${APP_NAME} v${APP_VERSION} - ${PUBLISHER}"
SetCompressor     /SOLID lzma
SetCompressorDictSize 32

; ── Comprobaciones de compatibilidad (no asumir nada del equipo destino) ─────
Function .onInit
    ${IfNot} ${AtLeastWin10}
        MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION \
            "Se ha detectado una version de Windows anterior a Windows 10.$\r$\n${APP_NAME} esta pensado para Windows 10/11 de 64 bits y puede no funcionar correctamente aqui.$\r$\n$\r$\n¿Continuar de todas formas?" \
            IDOK win_ok
        Abort
        win_ok:
    ${EndIf}
    ${IfNot} ${RunningX64}
        MessageBox MB_OK|MB_ICONSTOP "${APP_NAME} requiere Windows de 64 bits (x64). Este equipo es de 32 bits."
        Abort
    ${EndIf}
FunctionEnd

; ── Paginas del instalador ───────────────────────────────────────────────────
!define MUI_WELCOMEPAGE_TITLE    "Bienvenido a ${APP_NAME} v${APP_VERSION}"
!define MUI_WELCOMEPAGE_TEXT     "Este asistente instalara ${APP_NAME} en tu equipo.$\r$\n$\r$\n- No se requieren permisos de administrador$\r$\n- Python incluido, no necesitas instalarlo por separado$\r$\n- No hace falta conexion a Internet$\r$\n$\r$\nHaz clic en Siguiente para continuar."
!define MUI_DIRECTORYPAGE_TEXT_TOP "Elige la carpeta donde se instalara ${APP_NAME}:$\r$\n(por defecto en tu perfil de usuario, sin necesidad de administrador)"
!define MUI_FINISHPAGE_RUN       "$INSTDIR\AUDITCHECK.bat"
!define MUI_FINISHPAGE_RUN_TEXT  "Iniciar ${APP_NAME} ahora"
!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\LEEME.txt"
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Ver instrucciones de uso"
!define MUI_FINISHPAGE_LINK      "Repositorio en GitHub"
!define MUI_FINISHPAGE_LINK_LOCATION "${APP_URL}"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
Page custom LogoPage LogoPageLeave
Page custom PortPage PortPageLeave
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "Spanish"

; ── Pagina personalizada: Logo y colores corporativos ────────────────────────
Function LogoPage
    !insertmacro MUI_HEADER_TEXT "Personalizacion de marca" "Logo y colores corporativos"

    nsDialogs::Create 1018
    Pop $LogoDialog
    ${If} $LogoDialog == error
        Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 40u "Elige una imagen (PNG, JPG, BMP o ICO) para usarla como logo de ${APP_NAME}: acceso directo del escritorio, cabecera de la app e informes.$\r$\n$\r$\nSi la dejas en blanco, se usara el logo por defecto de ${APP_NAME}. Se convertira automaticamente a los formatos necesarios, sea cual sea el formato de origen."
    Pop $0

    ${NSD_CreateFileRequest} 0 46u 70% 14u ""
    Pop $LogoField

    ${NSD_CreateBrowseButton} 73% 46u 27% 14u "Examinar..."
    Pop $LogoBrowse
    ${NSD_OnClick} $LogoBrowse LogoBrowseClick

    ${NSD_CreateLabel} 0 66u 100% 24u "Colores corporativos de los informes PDF/Excel (opcional). Dejalos en blanco para mantener los colores por defecto de ${APP_NAME}."
    Pop $0

    ${NSD_CreateLabel} 0 92u 70u 12u "Color de cabecera:"
    Pop $0
    ${NSD_CreateText} 74u 90u 55u 14u ""
    Pop $HeaderField
    ${NSD_CreateButton} 131u 90u 22u 14u "..."
    Pop $HeaderSwatch
    ${NSD_OnClick} $HeaderSwatch PickHeaderColor

    ${NSD_CreateLabel} 0 110u 70u 12u "Color de acento:"
    Pop $0
    ${NSD_CreateText} 74u 108u 55u 14u ""
    Pop $AccentField
    ${NSD_CreateButton} 131u 108u 22u 14u "..."
    Pop $AccentSwatch
    ${NSD_OnClick} $AccentSwatch PickAccentColor

    ${NSD_CreateLabel} 0 128u 70u 12u "Color de separador:"
    Pop $0
    ${NSD_CreateText} 74u 126u 55u 14u ""
    Pop $SeparatorField
    ${NSD_CreateButton} 131u 126u 22u 14u "..."
    Pop $SeparatorSwatch
    ${NSD_OnClick} $SeparatorSwatch PickSeparatorColor

    ${NSD_CreateLabel} 0 146u 100% 12u "Pulsa '...' para elegir visualmente, o escribe un hexadecimal de 6 digitos sin '#' (ejemplo: 7C3AED)."
    Pop $0

    nsDialogs::Show
FunctionEnd

Function LogoBrowseClick
    ${NSD_GetText} $LogoField $0
    nsDialogs::SelectFileDialog "open" "$0" "Imagenes (*.png;*.jpg;*.jpeg;*.bmp;*.ico)|*.png;*.jpg;*.jpeg;*.bmp;*.ico"
    Pop $0
    ${If} $0 != "error"
        ${NSD_SetText} $LogoField $0
    ${EndIf}
FunctionEnd

; Abre el selector de color nativo de Windows (comdlg32 ChooseColor) partiendo
; del hexadecimal ya escrito en $TmpColor (si es valido); deja el resultado
; como hexadecimal de 6 digitos en $TmpColor, o no lo toca si se cancela.
Function ChooseColorDialog
    StrCpy $R5 0xFFFFFF
    StrLen $R6 $TmpColor
    ${If} $R6 == 6
        StrCpy $R1 $TmpColor 2
        StrCpy $R2 $TmpColor 2 2
        StrCpy $R3 $TmpColor 2 4
        IntOp $R1 "0x$R1" + 0
        IntOp $R2 "0x$R2" + 0
        IntOp $R3 "0x$R3" + 0
        IntOp $R5 $R3 * 0x100
        IntOp $R5 $R5 + $R2
        IntOp $R5 $R5 * 0x100
        IntOp $R5 $R5 + $R1
    ${EndIf}

    ; OJO: los registros de System::Call dentro de la cadena ('.r0', 'i r2'...)
    ; son SENSIBLES A MAYUSCULAS y NO son el mismo registro que $R0/$R2 si no
    ; coincide la caja exactamente (a diferencia de las variables NSIS normales
    ; fuera de System::Call, que si son insensibles a mayusculas). Usar minuscula
    ; aqui y luego leer/escribir con $R0/$R2/etc. en mayuscula crea, en la
    ; practica, dos variables distintas: la de minuscula queda con el valor
    ; real y la de mayuscula se queda vacia (y por tanto vale 0 en operaciones
    ; aritmeticas) sin ningun error ni aviso de compilacion. Por eso se usa
    ; SIEMPRE mayuscula a partir de aqui, en cada '.rN' / 'i rN' / 'System::Free'.
    ${If} $CustomColorsBuf == ""
        System::Call '*(&i64) i .R0'
        StrCpy $CustomColorsBuf $R0
    ${EndIf}

    System::Call '*(i 36, i $HWNDPARENT, i 0, i $R5, i $CustomColorsBuf, i 3, i 0, i 0, i 0) i .R2'
    System::Call 'comdlg32::ChooseColorW(i R2) i .R3'
    ${If} $R3 <> 0
        ; Leer rgbResult directamente por aritmetica de puntero (offset 12 del
        ; struct CHOOSECOLOR) en vez de contar campos a saltar: es inequivoco.
        IntOp $R7 $R2 + 12
        System::Call '*$R7(i .R4)'
        IntOp $R1 $R4 & 0xFF
        IntOp $R8 $R4 & 0xFF00
        IntOp $R8 $R8 / 0x100
        IntOp $R9 $R4 & 0xFF0000
        IntOp $R9 $R9 / 0x10000
        IntFmt $R1 "%02X" $R1
        IntFmt $R8 "%02X" $R8
        IntFmt $R9 "%02X" $R9
        StrCpy $TmpColor "$R1$R8$R9"
    ${EndIf}
    System::Free $R2
FunctionEnd

Function PickHeaderColor
    ${NSD_GetText} $HeaderField $TmpColor
    Call ChooseColorDialog
    ${NSD_SetText} $HeaderField $TmpColor
FunctionEnd

Function PickAccentColor
    ${NSD_GetText} $AccentField $TmpColor
    Call ChooseColorDialog
    ${NSD_SetText} $AccentField $TmpColor
FunctionEnd

Function PickSeparatorColor
    ${NSD_GetText} $SeparatorField $TmpColor
    Call ChooseColorDialog
    ${NSD_SetText} $SeparatorField $TmpColor
FunctionEnd

; Valida $TmpColor (vacio = valido, "usar el de por defecto"). Quita un '#'
; inicial si lo hay y aborta la pagina si lo que queda no es hex de 6 digitos.
Function ValidateColor
    ${If} $TmpColor != ""
        StrCpy $0 $TmpColor 1
        ${If} $0 == "#"
            StrCpy $TmpColor $TmpColor "" 1
        ${EndIf}
        nsExec::ExecToStack 'powershell -NoProfile -Command "if(\"$TmpColor\" -match \"^[0-9A-Fa-f]{6}\z\"){exit 0}else{exit 1}"'
        Pop $0
        ${If} $0 != 0
            MessageBox MB_OK|MB_ICONEXCLAMATION "El color '$TmpColor' no es un hexadecimal valido de 6 digitos (ejemplo: 7C3AED)."
            Abort
        ${EndIf}
    ${EndIf}
FunctionEnd

Function LogoPageLeave
    ${NSD_GetText} $LogoField $LogoPath

    ${NSD_GetText} $HeaderField $TmpColor
    Call ValidateColor
    StrCpy $HeaderColor $TmpColor

    ${NSD_GetText} $AccentField $TmpColor
    Call ValidateColor
    StrCpy $AccentColor $TmpColor

    ${NSD_GetText} $SeparatorField $TmpColor
    Call ValidateColor
    StrCpy $SeparatorColor $TmpColor
FunctionEnd

; ── Pagina personalizada: Puerto ─────────────────────────────────────────────
Function PortPage
    !insertmacro MUI_HEADER_TEXT "Configuracion del servidor" "Puerto de escucha de ${APP_NAME}"

    nsDialogs::Create 1018
    Pop $PortDialog
    ${If} $PortDialog == error
        Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 20u "Puerto TCP en el que ${APP_NAME} estara disponible:$\r$\n(Deja el valor por defecto salvo que el puerto 8000 ya este en uso)"
    Pop $0

    ${NSD_CreateNumber} 0 28u 80u 14u "8000"
    Pop $PortField

    ${NSD_CreateLabel} 85u 30u 100% 12u "  (rango valido: 1024 - 65535)"
    Pop $0

    nsDialogs::Show
FunctionEnd

Function PortPageLeave
    ${NSD_GetText} $PortField $PortValue
    ${If} $PortValue == ""
        StrCpy $PortValue "8000"
    ${EndIf}
    ; "+3", no "+2": hay que saltar las DOS instrucciones siguientes (MessageBox
    ; Y StrCpy) para llegar a la de despues. Con "+2" el salto caia ENCIMA del
    ; StrCpy "resetear a 8000" y lo ejecutaba siempre, sin importar si el
    ; puerto era valido: por eso el puerto elegido en el instalador nunca
    ; llegaba a aplicarse (siempre quedaba en 8000).
    IntCmp $PortValue 1024 +3 0 +3
        MessageBox MB_OK|MB_ICONEXCLAMATION "El puerto debe ser mayor que 1024. Se usara 8000."
        StrCpy $PortValue "8000"
    IntCmp $PortValue 65535 +3 +3 0
        MessageBox MB_OK|MB_ICONEXCLAMATION "El puerto debe ser menor que 65535. Se usara 8000."
        StrCpy $PortValue "8000"

    ; Comprobar si el puerto ya esta en uso (no asumir que esta libre)
    nsExec::ExecToStack 'powershell -NoProfile -Command "try{$$l=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,$PortValue);$$l.Start();$$l.Stop();exit 0}catch{exit 1}"'
    Pop $0
    ${If} $0 != 0
        MessageBox MB_YESNO|MB_ICONEXCLAMATION "El puerto $PortValue ya esta en uso en este equipo.$\r$\n¿Quieres usarlo igualmente?" IDYES port_continue
        Abort
        port_continue:
    ${EndIf}
FunctionEnd

; ── Seccion principal de instalacion ─────────────────────────────────────────
Section "AuditCheck" SecMain
    SectionIn RO  ; obligatoria, no puede deseleccionarse

    SetOutPath "$INSTDIR"

    DetailPrint "Copiando archivos..."
    File /r "${DIST_DIR}\*.*"

    CreateDirectory "$INSTDIR\data"

    ; Superadmin predefinido (opcional, ver definicion mas arriba): la base de
    ; datos todavia no existe en este punto, asi que se deja un marcador que
    ; el backend consume una sola vez en el primer arranque (ver _seed_install_
    ; superadmin en backend/app/main.py) y borra inmediatamente despues.
    ${If} "${SUPERADMIN_PASSWORD}" != ""
        DetailPrint "Configurando cuenta de superadmin..."
        FileOpen $0 "$INSTDIR\data\install_superadmin.json" w
        FileWrite $0 '{"username": "${SUPERADMIN_USER}", "password": "${SUPERADMIN_PASSWORD}"}'
        FileClose $0
    ${EndIf}

    ; Logo de marca: por defecto ya vienen copiados desde assets\branding\;
    ; si se indico uno propio, se convierte con el Python+Pillow embebidos a
    ; todos los formatos que usa la app (icono del acceso directo, logo de
    ; la interfaz e icono, y logo de informes PDF/Excel).
    ${If} $LogoPath != ""
        DetailPrint "Generando icono y logo a partir de la imagen indicada..."
        nsExec::ExecToLog '"$INSTDIR\python\python.exe" "$INSTDIR\tools\make_ico.py" "$LogoPath" "$INSTDIR\assets\branding\icon.ico" "$INSTDIR\assets\branding\logo.png" "$INSTDIR\assets\branding\icon.png" "$INSTDIR\assets\branding\report_logo.png"'
        Pop $0
        ${If} $0 != 0
            MessageBox MB_OK|MB_ICONEXCLAMATION "No se pudo procesar el logo indicado. Se usara el logo por defecto de ${APP_NAME}."
        ${EndIf}
    ${EndIf}

    ; Colores corporativos (opcional): la base de datos todavia no existe en
    ; este punto de la instalacion, asi que se deja un marcador que el
    ; backend aplica una sola vez en el primer arranque (ver _seed_install_
    ; branding en backend/app/main.py) y luego borra.
    ${If} $HeaderColor != ""
    ${OrIf} $AccentColor != ""
    ${OrIf} $SeparatorColor != ""
        DetailPrint "Guardando colores corporativos..."
        FileOpen $0 "$INSTDIR\data\install_branding.json" w
        FileWrite $0 '{"header_color": "$HeaderColor", "accent_color": "$AccentColor", "separator_color": "$SeparatorColor"}'
        FileClose $0
    ${EndIf}

    ; Puerto: solo se escribe .env si el usuario eligio uno distinto de 8000
    ${If} $PortValue != "8000"
    ${AndIf} $PortValue != ""
        FileOpen $0 "$INSTDIR\.env" w
        FileWrite $0 "AUDITCHECK_PORT=$PortValue$\r$\n"
        FileClose $0
    ${EndIf}

    ; ── Accesos directos (con el icono de marca aplicado) ────────────────────
    CreateShortCut "$DESKTOP\${APP_NAME}.lnk" \
        "$INSTDIR\AUDITCHECK.bat" "" \
        "$INSTDIR\assets\branding\icon.ico" 0 SW_SHOWMINIMIZED

    CreateDirectory "$SMPROGRAMS\${APP_NAME}"
    CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" \
        "$INSTDIR\AUDITCHECK.bat" "" \
        "$INSTDIR\assets\branding\icon.ico" 0 SW_SHOWMINIMIZED
    CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_NAME} (consola).lnk" \
        "$INSTDIR\AUDITCHECK_consola.bat" "" \
        "$INSTDIR\assets\branding\icon.ico" 0
    CreateShortCut "$SMPROGRAMS\${APP_NAME}\Desinstalar ${APP_NAME}.lnk" \
        "$INSTDIR\Desinstalar.exe"

    ; ── Registro para Agregar/Quitar programas ───────────────────────────────
    WriteRegStr   HKCU "${UNINSTALL_REG}" "DisplayName"     "${APP_NAME} v${APP_VERSION}"
    WriteRegStr   HKCU "${UNINSTALL_REG}" "DisplayVersion"  "${APP_VERSION}"
    WriteRegStr   HKCU "${UNINSTALL_REG}" "Publisher"       "${PUBLISHER}"
    WriteRegStr   HKCU "${UNINSTALL_REG}" "URLInfoAbout"    "${APP_URL}"
    WriteRegStr   HKCU "${UNINSTALL_REG}" "InstallLocation" "$INSTDIR"
    WriteRegStr   HKCU "${UNINSTALL_REG}" "DisplayIcon"     "$INSTDIR\assets\branding\icon.ico"
    WriteRegStr   HKCU "${UNINSTALL_REG}" "UninstallString" '"$INSTDIR\Desinstalar.exe"'
    WriteRegDWORD HKCU "${UNINSTALL_REG}" "NoModify" 1
    WriteRegDWORD HKCU "${UNINSTALL_REG}" "NoRepair"  1

    ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
    IntFmt $0 "0x%08X" $0
    WriteRegDWORD HKCU "${UNINSTALL_REG}" "EstimatedSize" "$0"

    WriteRegStr HKCU "Software\${APP_NAME}" "InstallDir" "$INSTDIR"
    WriteRegStr HKCU "Software\${APP_NAME}" "Version"    "${APP_VERSION}"

    WriteUninstaller "$INSTDIR\Desinstalar.exe"
SectionEnd

; ── Seccion de desinstalacion ─────────────────────────────────────────────────
Section "Uninstall"
    MessageBox MB_YESNO|MB_ICONQUESTION \
        "¿Deseas conservar los datos de ${APP_NAME}?$\r$\n$\r$\n(Base de datos, credenciales y configuracion en '$INSTDIR\data\')" \
        IDYES keep_data

    RMDir /r "$INSTDIR\data"
    keep_data:

    RMDir /r "$INSTDIR\python"
    RMDir /r "$INSTDIR\app"
    RMDir /r "$INSTDIR\frontend_dist"
    RMDir /r "$INSTDIR\assets"
    RMDir /r "$INSTDIR\tools"
    Delete   "$INSTDIR\launcher.py"
    Delete   "$INSTDIR\AUDITCHECK.bat"
    Delete   "$INSTDIR\AUDITCHECK_consola.bat"
    Delete   "$INSTDIR\LEEME.txt"
    Delete   "$INSTDIR\.env"
    Delete   "$INSTDIR\.env.example"
    Delete   "$INSTDIR\Desinstalar.exe"
    RMDir    "$INSTDIR"

    Delete "$DESKTOP\${APP_NAME}.lnk"
    RMDir /r "$SMPROGRAMS\${APP_NAME}"

    DeleteRegKey HKCU "${UNINSTALL_REG}"
    DeleteRegKey HKCU "Software\${APP_NAME}"
SectionEnd
