---
id: version-stable-webstorm
title: WebStorm Setup
original_id: webstorm
---

## WebStorm 2018.1 and above

Use the `Reformat with Prettier` action (`Alt-Shift-Cmd-P` on macOS or `Alt-Shift-Ctrl-P` on Windows and Linux) to format the selected code, a file, or a whole directory.

Don't forget to install `prettier` first.

To use Prettier in IntelliJ IDEA, PhpStorm, PyCharm, and other JetBrains IDEs, please install this [plugin](https://plugins.jetbrains.com/plugin/10456-prettier).

For older IDE versions, please follow the instructions below.

## Running Prettier on save using File Watcher

To automatically format your files using `prettier` on save, you can use a [File Watcher](https://plugins.jetbrains.com/plugin/7177-file-watchers).

Go to _Preferences | Tools | File Watchers_ and click **+** to add a new watcher.

In Webstorm 2018.2, select Prettier from the list, review the configuration, add any additional arguments if needed, and click OK.

In older IDE versions, select Custom and do the following configuration:

- **Name**: _Prettier_ or any other name
- **File Type**: _JavaScript_ (or _Any_ if you want to run `prettier` on all files)
- **Scope**: _Project Files_
- **Program**: full path to `.bin/prettier` or `.bin\prettier.cmd` in the project's `node_module` folder. Or, if Prettier is installed globally, select `prettier` on macOS and Linux or `C:\Users\user_name\AppData\Roaming\npm\prettier.cmd` on Windows (or whatever `npm prefix -g` returns).
- **Arguments**: `--write [other options] $FilePathRelativeToProjectRoot$`
- **Output paths to refresh**: `$FilePathRelativeToProjectRoot$`
- **Working directory**: `$ProjectFileDir$`
- **Environment variables**: add `COMPILE_PARTIAL=true` if you want to run `prettier` on partials (like `_component.scss`)
- **Auto-save edited files to trigger the watcher**: Uncheck to reformat on Save only.

![Example](/docs/assets/webstorm/file-watcher-prettier.png)

## WebStorm 2017.3 or earlier

### Using Prettier with ESLint

If you are using ESLint with [eslint-plugin-prettier](https://github.com/prettier/eslint-plugin-prettier), use the `Fix ESLint Problems` action to reformat the current file – find it using _Find Action_ (`Cmd/Ctrl-Shift-A`) or [add a keyboard shortcut](https://www.jetbrains.com/help/webstorm/configuring-keyboard-shortcuts.html) to it in _Preferences | Keymap_ and then use it.

Make sure that the ESLint integration is enabled in _Preferences | Languages & Frameworks | JavaScript | Code Quality Tools | ESLint_.

### Using Prettier as External Tool

Go to _Preferences | Tools | External Tools_ and click **+** to add a new tool. Let’s name it **Prettier**.

- **Program**: `prettier` on macOS and Linux or `C:\Users\user_name\AppData\Roaming\npm\prettier.cmd` on Windows (or whatever `npm prefix -g` returns), if Prettier is installed globally
- **Parameters**: `--write [other options] $FilePathRelativeToProjectRoot$`
- **Working directory**: `$ProjectFileDir$`

> If Prettier is installed locally in your project, replace the path in **Program** with `$ProjectFileDir$/node_modules/.bin/prettier` on macOS and Linux or `$ProjectFileDir$\node_modules\.bin\prettier.cmd` on Windows.

![Example](/docs/assets/webstorm/external-tool-prettier.png)

Press `Cmd/Ctrl-Shift-A` (_Find Action_), search for _Prettier_, and then hit `Enter`.

It will run `prettier` for the current file.

You can [add a keyboard shortcut](https://www.jetbrains.com/help/webstorm/configuring-keyboard-shortcuts.html) to run this External tool configuration in _Preferences | Keymap_.
