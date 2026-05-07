/**
 * Minimal i18n. Keys are flat dotted strings; values may contain `{name}`
 * placeholders interpolated via the second arg of `t()`.
 *
 * Only Polish is shipped right now. To add another locale:
 *   1. export a second dictionary with the same keys,
 *   2. switch `active` below (or route through a setting).
 */

type Dict = Record<string, string>;

const pl: Dict = {
  // App & errors
  "app.loadingWorkspace": "Wczytywanie przestrzeni…",
  "error.unknown": "Nieznany błąd",

  // External-change conflict banner
  "conflict.title": "Plik zmieniony poza Splotem",
  "conflict.detail":
    "„{name}\" został zmieniony na dysku, a masz niezapisane zmiany w edytorze.",
  "conflict.reload": "Przeładuj z dysku",
  "conflict.keepMine": "Zachowaj moje",
  "conflict.showDiff": "Pokaż różnice",
  "conflict.diff.title": "Różnice — {name}",
  "conflict.diff.mine": "Twoja wersja",
  "conflict.diff.theirs": "Wersja na dysku",
  "conflict.diff.dismiss": "Zamknij",
  "conflict.diff.identical":
    "Wersje są identyczne. Nic do porównania.",
  "conflict.diff.loadError": "Nie udało się odczytać wersji z dysku.",

  // Workspace error kinds (from Rust WorkspaceError)
  "error.kind.NotInitialized": "Przestrzeń nie jest zainicjalizowana",
  "error.kind.PathEscapesRoot": "Ścieżka wychodzi poza przestrzeń roboczą",
  "error.kind.NotAFile": "To nie jest plik",
  "error.kind.NotADirectory": "To nie jest katalog",
  "error.kind.UnknownWorkspace": "Nieznana przestrzeń robocza",
  "error.kind.Io": "Błąd wejścia/wyjścia: {message}",
  "error.kind.UnsupportedFileType": "Nieobsługiwany typ pliku",
  "error.kind.EmptyName": "Nazwa nie może być pusta",
  "error.kind.InvalidName": "Nazwa zawiera niedozwolone znaki",
  "error.kind.AlreadyExists": "Plik lub katalog o tej nazwie już istnieje",

  // Breadcrumb
  "breadcrumb.saving": "zapisywanie…",
  "breadcrumb.dirty": "niezapisane",

  // Empty state
  "empty.title": "Cisza przed pisaniem",
  "empty.body": "Wybierz plik z lewej, utwórz nowy ({new}) albo otwórz szybką paletę ({quickopen}).",

  // Workspace switcher
  "ws.reveal": "Pokaż w menedżerze plików",
  "ws.remove": "Usuń z listy",
  "ws.revealAria": "Pokaż „{name}\" w menedżerze plików",
  "ws.removeAria": "Usuń „{name}\" z listy",
  "ws.openFolder": "Otwórz folder…",
  "ws.empty": "Brak przestrzeni",
  "ws.openDialog.title": "Otwórz folder jako przestrzeń roboczą",
  "ws.remove.title": "Usuń przestrzeń",
  "ws.remove.confirm": "Usunąć „{name}\" z listy?\n\nPliki na dysku nie zostaną usunięte.",
  "ws.remove.ok": "Usuń",
  "ws.remove.cancel": "Anuluj",
  // Quick open — common
  "qo.navigate": "nawiguj",
  "qo.close": "zamknij",

  // Quick open — files
  "qo.mode.files": "Pliki",
  "qo.placeholder.files": "Znajdź plik…",
  "qo.empty.typeToSearch": "Zacznij pisać",
  "qo.empty.noMatches": "Brak wyników",
  "qo.hint.files1": " wyszukuje w zawartości · ",
  "qo.hint.files2": " tworzy nowy plik.",

  // Quick open — content
  "qo.mode.content": "Zawartość",
  "qo.placeholder.content": "Szukaj w zawartości plików…",
  "qo.empty.minChars": "Wpisz co najmniej {n} znaki",
  "qo.empty.searching": "Szukam…",
  "qo.hint.content": "Szukanie w zawartości. Usuń {prefix}, żeby szukać po nazwie.",

  // Quick open — new
  "qo.mode.new": "Nowy",
  "qo.placeholder.new": "Nazwa lub folder/nazwa — Enter tworzy",
  "qo.empty.typeName": "Wpisz nazwę. Użyj {slash} dla folderów.",
  "qo.new.creating": "Tworzę…",
  "qo.new.createFolder": "Utwórz folder",
  "qo.new.createFile": "Utwórz plik",
  "qo.hint.new1": " tworzy. Użyj ",
  "qo.hint.new2": " dla folderów, ",
  "qo.hint.new3": " na końcu dla pustego folderu. ",
  "qo.hint.new4": " dodane, gdy brak rozszerzenia.",

  // Quick open — symbols (headings of the open file)
  "qo.mode.symbol": "Nagłówki",
  "qo.placeholder.symbol": "Skocz do nagłówka…",
  "qo.empty.noHeadings": "Plik nie ma nagłówków.",
  "qo.empty.noFile": "Otwórz plik, aby przeglądać nagłówki.",
  "qo.hint.symbol": "Skok do nagłówka w bieżącym pliku. Usuń {prefix}, żeby szukać po nazwie.",
  "qo.hint.files3": " · ",
  "qo.hint.files4": " skok do nagłówka.",

  // Command palette
  "cmd.mode": "Komenda",
  "cmd.placeholder": "Wpisz komendę…",
  "cmd.empty": "Brak komend",
  "cmd.hint.run": "wykonaj",

  // Commands
  "cmd.group.go": "Przejdź",
  "cmd.group.file": "Plik",
  "cmd.group.view": "Widok",
  "cmd.group.edit": "Edytor",
  "cmd.group.workspace": "Przestrzeń",
  "cmd.quickopen.files": "Szybkie otwieranie…",
  "cmd.quickopen.content": "Szukaj w zawartości…",
  "cmd.file.new": "Nowy plik…",
  "cmd.file.save": "Zapisz",
  "cmd.file.close": "Zamknij plik",
  "cmd.file.revealCurrent": "Pokaż „{name}\" w menedżerze plików",
  "cmd.view.toggleSidebar": "Przełącz panel boczny",
  "cmd.view.typewriterOn": "Włącz tryb maszyny do pisania (typewriter mode)",
  "cmd.view.typewriterOff": "Wyłącz tryb maszyny do pisania (typewriter mode)",
  "cmd.view.focusOn": "Włącz tryb skupienia (focus mode)",
  "cmd.view.focusOff": "Wyłącz tryb skupienia (focus mode)",
  "header.typewriter.badge": "typewriter",
  "header.typewriter.title": "Tryb maszyny do pisania jest włączony ({shortcut})",
  "header.focus.badge": "focus",
  "header.focus.title": "Tryb skupienia jest włączony ({shortcut})",
  "cmd.workspace.openFolder": "Otwórz folder jako przestrzeń…",
  "cmd.workspace.switch": "Przełącz na {name}",
  "cmd.workspace.reveal": "Pokaż {name} w menedżerze plików",
  "cmd.workspace.remove": "Usuń {name} z listy",
  "cmd.file.trash": "Przenieś „{name}\" do kosza",
  "cmd.file.move": "Przenieś „{name}\" do folderu…",
  "cmd.file.rename": "Zmień nazwę „{name}\"…",
  "cmd.editor.sortTasks": "Posortuj zadania (zrobione na koniec)",
  "cmd.editor.find": "Znajdź w pliku…",

  // Rename file modal
  "rename.mode": "Zmień nazwę",
  "rename.title": "Zmień nazwę pliku",
  "rename.placeholder": "Nowa nazwa dla „{name}\" (Enter zatwierdza)",
  "rename.invalid": "Nazwa nie może być pusta ani zawierać „/\" lub „\\\".",
  "rename.hint.unchanged": "Nazwa bez zmian.",
  "rename.hint.willRename": "Nowa nazwa: {name}",
  "rename.hint.run": "zmień nazwę",

  // Move file modal
  "move.mode": "Przenieś",
  "move.title": "Przenieś plik do folderu",
  "move.placeholder": "Dokąd przenieść „{name}\"? (Enter zatwierdza)",
  "move.empty": "Brak pasujących folderów",
  "move.notFound": "Folder „{path}\" nie istnieje",
  "move.hint.run": "przenieś",

  // Trash
  "trash.title": "Przenieś do kosza",
  "trash.confirm": "Przenieść „{name}\" do kosza?\n\nPlik trafi do folderu .trash i nie będzie widoczny w Splocie.",
  "trash.ok": "Przenieś",
  "trash.cancel": "Anuluj",
  "trash.aria": "Przenieś „{name}\" do kosza",

  // Settings
  "cmd.settings.open": "Ustawienia…",
  "settings.title": "Ustawienia",
  "settings.close": "Zamknij",
  "settings.section.editor": "Edytor",
  "settings.fullWidth.label": "Minimalny margines (pełna szerokość panelu)",
  "settings.fullWidth.help":
    "Gdy wyłączone, tekst trzyma się komfortowej szerokości kolumny (72 znaki).",
  "settings.autosave.label": "Częstotliwość autozapisu",
  "settings.autosave.seconds": "{n} s",
  "settings.inlineCalc.label": "Obliczenia w tekście",
  "settings.inlineCalc.help":
    "Gdy wpiszesz np. 2+2= na końcu wiersza, Splot pokaże wynik jako podpowiedź. Tab wstawia wynik do tekstu. Obsługa: + − × ÷ % ^, nawiasy, stałe (pi, e, tau), funkcje (sqrt, sin, log, min, max…), „100+20%” jako 120, oraz daty: 4.4.2024+6 dni, 31.01.2024+1 mies, 10.4.2024−4.4.2024.",
  "settings.section.appearance": "Wygląd",
  "settings.theme.label": "Motyw",
  "settings.theme.system": "Systemowy",
  "settings.theme.light": "Jasny",
  "settings.theme.dark": "Ciemny",
  "settings.fontSize.label": "Rozmiar tekstu w edytorze",
  "settings.fontSize.px": "{n} px",
  "settings.lineHeight.label": "Interlinia",
  "settings.font.label": "Krój pisma",
  "settings.font.serif": "Szeryfowy",
  "settings.font.sans": "Bezszeryfowy",
  "settings.font.system": "Systemowy",
  "settings.font.mono": "Maszynowy",
  "settings.section.files": "Pliki",
  "settings.showTrash.label": "Pokaż kosz w drzewie",
  "settings.showTrash.help":
    "Gdy włączone, folder .trash z usuniętymi plikami pojawia się w panelu. Pliki usuwać trzeba ręcznie, poza Splotem.",
  "settings.linkOpen.label": "Otwieranie linków",
  "settings.linkOpen.help": "Kiedy kliknięcie w adres URL ma go otworzyć w przeglądarce.",
  "settings.linkOpen.click": "Sam klik",
  "settings.linkOpen.modClick": "{mod}+klik",
  "settings.section.tasks": "Zadania",
  "settings.autoSortTasks.label": "Przesuwaj zrobione zadania na koniec listy",
  "settings.autoSortTasks.help":
    "Gdy włączone, zaznaczenie checkboxa przenosi zadanie na koniec listy.",
  "settings.section.shortcuts": "Skróty",
  "settings.ideLineShortcuts.label": "Skróty linii w stylu VS Code",
  "settings.ideLineShortcuts.help":
    "Gdy włączone: {mod}+D usuwa wiersz, {mod}+Shift+↑/↓ duplikuje, Alt+Shift+↑/↓ przenosi. Nadpisuje domyślne skróty CodeMirror.",
  "settings.wheelZoom.label": "{mod}+kółko myszy zmienia rozmiar tekstu",
  "settings.wheelZoom.help":
    "Gdy włączone, przewijanie kółkiem przy wciśniętym {mod} powiększa lub pomniejsza tekst w edytorze.",

  // Updates
  "cmd.update.check": "Sprawdź aktualizacje…",
  "update.title": "Aktualizacje",
  "update.checking": "Sprawdzam aktualizacje…",
  "update.upToDate": "Masz najnowszą wersję Splota.",
  "update.available":
    "Dostępna nowa wersja: {version} (obecnie {current}).",
  "update.publishedOn": "Opublikowano: {date}",
  "update.install": "Pobierz i zainstaluj",
  "update.downloading": "Pobieranie aktualizacji…",
  "update.installing": "Instaluję — Splot zaraz uruchomi się ponownie…",
  "update.recheck": "Sprawdź ponownie",
  "update.unsupported":
    "Aktualizacje wbudowane są dostępne tylko na macOS i Windows. Na Linuksie zaktualizuj Splota przez swojego menedżera pakietów.",

  // Help
  "help.title": "Pomoc",
  "help.open": "Pokaż pomoc",
  "cmd.help.open": "Pomoc i skróty…",
  "help.section.navigation": "Nawigacja",
  "help.section.file": "Plik",
  "help.section.view": "Widok",
  "help.section.editor": "Edytor",
  "help.section.formatting": "Formatowanie markdown",
  "help.nav.quickOpen": "Szybkie otwieranie plików",
  "help.nav.contentSearch": "Szukaj w zawartości (po szybkim otwieraniu wpisz >)",
  "help.nav.symbolJump": "Skok do nagłówka (po szybkim otwieraniu wpisz @)",
  "help.nav.commandPalette": "Paleta komend",
  "help.nav.settings": "Ustawienia",
  "help.nav.help": "Ta pomoc",
  "help.file.new": "Nowy plik (użyj / dla folderów)",
  "help.file.save": "Zapisz (autozapis działa w tle)",
  "help.file.move": "Przenieś plik do folderu…",
  "help.view.toggleSidebar": "Przełącz panel boczny",
  "help.view.typewriter": "Tryb maszyny do pisania",
  "help.view.focus": "Tryb skupienia (przyciemnia inne akapity)",
  "help.view.zoomIn": "Zwiększ tekst edytora",
  "help.view.zoomOut": "Zmniejsz tekst edytora",
  "help.view.zoomReset": "Przywróć rozmiar tekstu",
  "help.editor.selectParagraph": "Zaznacz akapit",
  "help.editor.tripleClick": "Potrójne kliknięcie zaznacza akapit",
  "help.editor.toggleTask": "Przełącz zadanie (lub utwórz z wiersza listy)",
  "help.editor.find": "Znajdź / zamień w pliku",
  "help.editor.findNext": "Następne dopasowanie",
  "help.editor.findPrev": "Poprzednie dopasowanie",
  "help.section.dictation": "Dyktowanie",
  "help.dictation.start":
    "Pisanie głosem (systemowe — działa w każdym polu tekstowym)",
  "help.md.headings": "# Nagłówek, ## Podnagłówek, ### …",
  "help.md.emphasis": "*kursywa* lub _kursywa_",
  "help.md.strong": "**pogrubienie**",
  "help.md.lists": "- punkt  ·  * punkt",
  "help.md.ordered": "1. lista numerowana",
  "help.md.links": "[tekst](https://…)",
  "help.md.code": "`kod w tekście`  ·  ``` blok ```",
  "help.md.quote": "> cytat",
};

const active: Dict = pl;

export function t(key: string, params?: Record<string, string | number>): string {
  let s = active[key];
  if (s === undefined) {
    console.warn(`[i18n] missing key: ${key}`);
    return key;
  }
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return s;
}
