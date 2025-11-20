#!/usr/bin/env node
import fs from 'fs-extra';
import path from 'path';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import inquirer from 'inquirer';

dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'x-ai/grok-4.1-fast';

interface RenameOperation {
  original: string;
  new: string;
  reason?: string;
}

async function main() {
  // When using npm start, arguments are passed after a double dash,
  // but sometimes yargs needs help parsing them if they come via npm script
  const argv = await yargs(hideBin(process.argv))
    .option('dir', {
      alias: 'd',
      type: 'string',
      description: 'Target directory',
      default: process.cwd(),
    })
    .option('prompt', {
      alias: 'p',
      type: 'string',
      description: 'Rename instruction prompt',
    })
    .help()
    .parse(); // Use .parse() instead of .argv to ensure async parsing resolves

  const { dir: dirAnswer, prompt: promptAnswer } = await inquirer.prompt([
    {
      type: 'input',
      name: 'dir',
      message: 'Enter the target directory',
      default: argv.dir || process.cwd(),
      validate: async (input: string) => {
        const trimmed = input.trim();
        if (!trimmed) {
          return 'Target directory is required.';
        }
        const resolved = path.resolve(trimmed);
        if (!(await fs.pathExists(resolved))) {
          return 'Directory does not exist.';
        }
        const stats = await fs.stat(resolved);
        return stats.isDirectory() ? true : 'Path must be a directory.';
      },
    },
    {
      type: 'input',
      name: 'prompt',
      message: 'Enter the rename instruction prompt',
      default: argv.prompt,
      validate: (input: string) => (input.trim() ? true : 'Prompt is required.'),
    },
  ]);

  const targetDir = path.resolve(dirAnswer.trim());
  const renamePrompt = promptAnswer.trim();
  
  if (!OPENROUTER_API_KEY) {
    console.error('Error: OPENROUTER_API_KEY is not set in environment variables or .env file.');
    process.exit(1);
  }

  const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: OPENROUTER_API_KEY,
    defaultHeaders: {
      'HTTP-Referer': 'https://github.com/your-repo/rename-llm', // Optional, for including your app on openrouter.ai rankings.
      'X-Title': 'Rename LLM CLI', // Optional. Shows in rankings on openrouter.ai.
    }
  });

  try {
    const files = await fs.readdir(targetDir);
    // Filter only files, ignore directories for now to keep it simple
    const fileStats = await Promise.all(files.map(async (f) => {
      const stat = await fs.stat(path.join(targetDir, f));
      return { name: f, isFile: stat.isFile() };
    }));
    
    const onlyFiles = fileStats.filter(s => s.isFile).map(s => s.name);

    if (onlyFiles.length === 0) {
      console.log('No files found in the target directory.');
      return;
    }

    console.log(`Found ${onlyFiles.length} files. Querying LLM...`);

    const systemPrompt = `
You are a file renaming assistant. 
You will receive a list of filenames and a user prompt describing how to rename them.
You must return a JSON object with a "operations" key containing an array of renaming operations.
Each operation must have:
- "original": The exact original filename from the list.
- "new": The new filename based on the user's prompt.
- "reason": A brief explanation (optional).

Do not rename files that don't match the user's criteria.
Ensure new filenames are valid for the filesystem (no illegal characters).
Do not change the file extension unless explicitly asked.
Return ONLY valid JSON.
    `;

    const userMessage = `
Files:
${JSON.stringify(onlyFiles, null, 2)}

User Prompt: "${renamePrompt}"
    `;

    const completion = await openai.chat.completions.create({
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      console.error('Received empty response from LLM.');
      return;
    }

    let operations: RenameOperation[] = [];
    try {
      const parsed = JSON.parse(content);
      operations = parsed.operations || [];
    } catch (e) {
      console.error('Failed to parse LLM response as JSON:', content);
      return;
    }

    if (operations.length === 0) {
      console.log('No files matched the criteria for renaming.');
      return;
    }

    console.log('\nProposed Changes:');
    operations.forEach(op => {
      console.log(`${op.original} -> ${op.new}  (${op.reason || 'No reason provided'})`);
    });

    // Validate that original files exist and new filenames don't clash
    const validationErrors: string[] = [];
    const newNames = new Set<string>();

    for (const op of operations) {
        if (!onlyFiles.includes(op.original)) {
            validationErrors.push(`Original file not found: ${op.original}`);
        }
        if (newNames.has(op.new)) {
            validationErrors.push(`Duplicate target filename: ${op.new}`);
        }
        newNames.add(op.new);
        if (await fs.pathExists(path.join(targetDir, op.new)) && !operations.find(o => o.original === op.new)) {
             // If target exists and isn't being renamed itself (simple check, handling cycles is harder)
             // Actually, if target exists, we should warn.
             console.warn(`Warning: Target file ${op.new} already exists.`);
        }
    }

    if (validationErrors.length > 0) {
        console.error('Validation Errors:');
        validationErrors.forEach(e => console.error(`- ${e}`));
        const { continueAnyway } = await inquirer.prompt([{
            type: 'confirm',
            name: 'continueAnyway',
            message: 'Validation errors found. Do you want to try continuing anyway?',
            default: false
        }]);
        if (!continueAnyway) return;
    }

    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: 'Do you want to proceed with the renaming?',
      default: false,
    }]);

    if (confirm) {
      for (const op of operations) {
        const oldPath = path.join(targetDir, op.original);
        const newPath = path.join(targetDir, op.new);
        try {
          await fs.rename(oldPath, newPath);
          console.log(`Renamed: ${op.original} -> ${op.new}`);
        } catch (err) {
          console.error(`Failed to rename ${op.original}:`, err);
        }
      }
      console.log('Done.');
    } else {
      console.log('Operation cancelled.');
    }

  } catch (error) {
    console.error('An error occurred:', error);
  }
}

main();

