#!/usr/bin/env node

// Clear the console
process.stdout.write('\x1Bc');

import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import figlet from 'figlet';
import inquirer from 'inquirer';
import pLimit from 'p-limit';
import gradient from 'gradient-string';

const limit = pLimit(4);

// Generate ASCII text
const asciiText = figlet.textSync('RECTIFIER', { horizontalLayout: 'full' });

// Apply color and bold styling
console.log(gradient.fruit(asciiText));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const drive = google.drive({
  version: 'v3',
  auth: new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'rectifyCredentials.json'),
    scopes: ['https://www.googleapis.com/auth/drive'],
  }),
});

async function uploadFile(filePath, googleDriveFolderId, convert) {
  const actionText = ['RECTIFY', 'GAMES'][Math.floor(Math.random() * 2)];
  const fileName = path.basename(filePath);
  actionText === 'RECTIFY'
    ? console.log(chalk.yellowBright(`${actionText} --> ${fileName}`))
    : console.log(chalk.redBright(`${actionText} --> ${fileName}`));

  try {
    const fileMetadata = {
      name: fileName,
      parents: [googleDriveFolderId],
    };
    const media = {
      body: fs.createReadStream(filePath),
    };

    if (convert) {
      const ext = path.extname(filePath).toLowerCase();
      fileMetadata.mimeType = ext === '.docx' ? 'application/vnd.google-apps.document' : 'application/vnd.google-apps.spreadsheet';
      media.mimeType = ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }

    await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id',
    });

    console.log(chalk.blueBright(`UPLOAD ${fileName}`));
  } catch (error) {
    console.error(chalk.red(`Error during upload of ${fileName}: ${error.message}`));
  }
}

async function createGoogleDriveFolder(name, parentFolderId) {
  const fileMetadata = {
    name: name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: parentFolderId ? [parentFolderId] : [],
  };
  const folder = await drive.files.create({
    resource: fileMetadata,
    fields: 'id',
  });
  return folder.data.id;
}

async function uploadDirectory(localPath, googleDriveFolderId) {
  const files = fs.readdirSync(localPath);
  const tasks = [];

  for (const file of files) {
    const fullPath = path.join(localPath, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      const newFolderId = await createGoogleDriveFolder(file, googleDriveFolderId);
      tasks.push(uploadDirectory(fullPath, newFolderId));
    } else if (stat.isFile()) {
      const convert = path.extname(file) === '.docx' || path.extname(file) === '.xlsx';
      // Use limit to control concurrency for file uploads
      tasks.push(limit(() => uploadFile(fullPath, googleDriveFolderId, convert)));
    }
  }

  // Wait for all tasks (both file uploads and directory processing) to complete
  await Promise.all(tasks);
}

async function main() {
  const answers = await inquirer.prompt([
    {
      name: 'localPath',
      type: 'input',
      message: 'Enter the path to the folder you want to upload:',
      validate: (input) => (input.length > 0 ? true : 'Path cannot be empty.'),
    },
    {
      name: 'googleDriveFolderId',
      type: 'input',
      message: 'Enter the Google Drive folder ID to upload into:',
      validate: (input) =>
        input.length > 0 ? true : 'Folder ID cannot be empty.',
    },
  ]);

  try {
    await uploadDirectory(answers.localPath, answers.googleDriveFolderId);
    console.log(chalk.greenBright('All files [RECTIFIED, GAMED, UPLOADED].'));
    console.log(chalk.greenBright('END OF LINE⎕'));

  } catch (error) {
    console.log(chalk.redBright(`Upload process failed: ${error.message}`));
  }
}

main().catch((error) => {
  console.error(chalk.redBright('Error during upload:'), error);
});
