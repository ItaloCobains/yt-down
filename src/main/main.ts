/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import https from 'https';
import { autoUpdater } from 'electron-updater';

const execAsync = promisify(exec);
import log from 'electron-log';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;

function getYtDlpUrl(): string {
  const platform = process.platform;
  const baseUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/';

  if (platform === 'win32') {
    return `${baseUrl}yt-dlp.exe`;
  } else if (platform === 'darwin') {
    return `${baseUrl}yt-dlp_macos`;
  } else {
    return `${baseUrl}yt-dlp`;
  }
}

function getYtDlpPath(): string {
  const userDataPath = app.getPath('userData');
  const binDir = path.join(userDataPath, 'bin');

  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  const filename = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  return path.join(binDir, filename);
}

async function downloadFile(url: string, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);

    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirects
        return downloadFile(response.headers.location!, filePath)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        // Make executable on Unix systems
        if (process.platform !== 'win32') {
          fs.chmodSync(filePath, 0o755);
        }
        resolve();
      });

      file.on('error', (err) => {
        fs.unlink(filePath, () => {}); // Clean up on error
        reject(err);
      });
    }).on('error', reject);
  });
}

async function ensureYtDlp(): Promise<string> {
  const ytDlpPath = getYtDlpPath();

  // Check if already exists
  if (fs.existsSync(ytDlpPath)) {
    return ytDlpPath;
  }

  console.log('Downloading yt-dlp...');
  const url = getYtDlpUrl();

  try {
    await downloadFile(url, ytDlpPath);
    console.log('yt-dlp downloaded successfully');
    return ytDlpPath;
  } catch (error) {
    console.error('Failed to download yt-dlp:', error);
    throw new Error('Failed to download yt-dlp');
  }
}

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.log(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});

ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: 'Selecione a pasta de download'
  });
  return result;
});

ipcMain.handle('download:start', async (_, { url, outputPath, format }) => {
  try {
    console.log('Starting download:', { url, outputPath, format });

    // Ensure yt-dlp is available
    const ytDlpPath = await ensureYtDlp();

    // Build command arguments
    const args = [
      url,
      '-o', `${outputPath}/%(title)s.%(ext)s`,
    ];

    // Format specific options
    if (format === 'mp3') {
      args.push('--extract-audio', '--audio-format', 'mp3', '--audio-quality', '192K');
    } else if (format === 'mp4') {
      args.push('--format', 'best[ext=mp4]');
    }

    console.log('Executing:', ytDlpPath, args.join(' '));

    // Spawn the download process
    const downloadProcess = spawn(ytDlpPath, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Handle process output
    downloadProcess.stdout?.on('data', (data) => {
      console.log('yt-dlp stdout:', data.toString());
    });

    downloadProcess.stderr?.on('data', (data) => {
      console.log('yt-dlp stderr:', data.toString());
    });

    // Return immediately (download runs in background)
    return {
      success: true,
      message: `Download iniciado! Salvando em: ${outputPath}`,
      pid: downloadProcess.pid
    };

  } catch (error) {
    console.error('Download error:', error);
    return {
      success: false,
      message: `Erro ao iniciar download: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    };
  }
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug').default();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(() => {
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);
