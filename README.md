# Pi Launcher

Manage your [OMP](https://github.com/can1357/oh-my-pi) accounts and open one [Pi Desktop](https://github.com/FaqFirebase/pi-desktop) window per account, side by side. For example, one window for your work account and another for a personal one.

Each account is an OMP profile: `default` (the plain `~/.omp` folder) or a named profile under `~/.omp/profiles/<name>`. Each profile is signed in separately. The launcher starts Pi Desktop once per account, and each window:
- has its own data folder;
- shows the account's label in its title;
- runs its agents under that account's profile.

Each window lists only that account's sessions, models and plugins.

> **Alpha.** This is an early release. Expect rough edges and breaking changes.

## Requirements

- Windows 10 or 11 (x64).
- [OMP](https://github.com/can1357/oh-my-pi), with `omp.exe` on PATH (or its location set in Settings).
- A Pi Desktop newer than 0.2.2-alpha. This launcher relies on support added after that release: one instance per data folder, reading OMP's files from `OMP_PROFILE`, and the window title label. Until a release includes it, use a build of Pi Desktop's `Dev` branch.

## Install

Download from [Releases](https://github.com/PatFox/pi-launcher/releases):

- `Pi-Launcher-<version>-win-x64-setup.exe`: an installer for your user account (Start menu and desktop shortcuts).
- `Pi-Launcher-<version>-win-x64.exe`: a portable exe that runs without installing.

The binaries aren't code-signed, so Windows SmartScreen may warn on first run. Choose **More info › Run anyway**.

## Using it

- **First run:** the launcher adds an account for every OMP profile already on the computer.
- **Add an account:** type a new profile name and choose **Add and sign in**. A console window opens running `omp --profile <name> login`.
- **Open an account:** click its name or **Open**. When its window is already open, the same button brings it forward. **Restart** and **Close** act on that account's window.
- **Account settings (gear button):** the label, colour and OMP profile name, applied together on **Save**.
- **Launcher settings (Settings button):** where Pi Desktop and omp are, and whether to reopen the accounts that were open when the launcher last closed.

Removing an account only removes it from the launcher: the OMP profile and its sign-in stay. Signing out is a separate action.

### Finding Pi Desktop

With the Pi Desktop executable left empty in Settings, the launcher uses the installed Pi Desktop:
- `%LOCALAPPDATA%\Programs\Pi Desktop\Pi Desktop.exe` (installed for the current user), or
- `%ProgramFiles%\Pi Desktop\Pi Desktop.exe` (installed for all users).

To use a different install or a dev checkout, set the executable to run, plus its arguments if any. For a checkout, that's its Electron (`<checkout>\node_modules\electron\dist\electron.exe`) with the checkout folder as the argument.

### Labels and profile names

- **Label:** the launcher's own name for the account, also shown in its Pi Desktop window title. It changes nothing in OMP.
- **Profile name** (named profiles only): renames the OMP profile itself.
  - OMP has no rename command, so the launcher moves `~/.omp/profiles/<old>` to `<new>` and updates the profile's session-file pointers. It also moves the account's data folder. The sign-in, sessions, models and plugins move with it.
  - The account's window must be closed. Windows refuses to move a profile whose files are open, so a profile in use elsewhere makes the rename fail before anything changes.
  - Anything else that uses the old name (scripts, `omp --profile <old>`, shell aliases) needs the new name.
  - The default profile is `~/.omp` itself and can't be renamed; give it a label instead.

## Data

Everything lives in one folder: `%APPDATA%\Pi Launcher` by default. To move it, set the `PI_LAUNCHER_ROOT` environment variable to another folder.

| Path | Contents |
|---|---|
| `launcher.json` | Accounts (profile, label, colour), the Pi Desktop command, the omp path, the reopen option |
| `instances\<account>\` | That account's Pi Desktop data folder (settings, workspaces, logs) |
| `app-data\` | The launcher's own window data |

## How an instance starts

The launcher starts Pi Desktop with:

- `PI_DESKTOP_USER_DATA_DIR=<root>\instances\<account>`. Pi Desktop gives each data folder its own single-instance lock, so windows for different accounts run side by side.
- `OMP_PROFILE=<profile>`
- `PI_DESKTOP_WINDOW_TITLE=<label>`

omp's folder is put first on `PATH`. Variables that would change how Pi Desktop itself starts are removed, for example `ELECTRON_RENDERER_URL` from the launcher's own dev mode, or an inherited `OMP_PROFILE`.

**Close** asks the window to close, so Pi Desktop stops its own agent processes. The process tree is ended only if it hasn't exited after 15 seconds. Instances stay open when the launcher closes.

## Development

```powershell
npm install
npm start          # build and run
npm run dev        # run with hot reload
npm test           # unit tests
npm run typecheck
npm run lint
npm run package    # Windows installer and portable exe in release\
```

## License

[MIT](LICENSE)
