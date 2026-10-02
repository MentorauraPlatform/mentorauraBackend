import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as readline from 'node:readline';

const prisma = new PrismaClient();

function getArg(key: string): string | undefined {
  const prefix = `--${key}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  if (arg) return arg.slice(prefix.length);

  const idx = process.argv.indexOf(`--${key}`);
  if (idx !== -1 && idx < process.argv.length - 1) {
    return process.argv[idx + 1];
  }
  return undefined;
}

class TerminalPrompter {
  private isTTY: boolean;
  private rl?: readline.Interface;
  private iterator?: AsyncIterableIterator<string>;

  constructor() {
    this.isTTY = Boolean(process.stdin.isTTY);
    if (!this.isTTY) {
      this.rl = readline.createInterface({ input: process.stdin, terminal: false });
      this.iterator = this.rl[Symbol.asyncIterator]();
    }
  }

  async ask(promptText: string): Promise<string> {
    if (!this.isTTY) {
      process.stdout.write(promptText);
      const next = await this.iterator!.next();
      return next.done ? '' : String(next.value).trim();
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return new Promise((resolve) => {
      rl.question(promptText, (ans) => {
        rl.close();
        resolve(ans.trim());
      });
    });
  }

  async askPassword(promptText: string): Promise<string> {
    if (!this.isTTY) {
      return this.ask(promptText);
    }

    return new Promise((resolve) => {
      process.stdout.write(promptText);
      let password = '';
      const wasRaw = process.stdin.isRaw;
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      const onData = (chunk: string) => {
        for (const char of chunk) {
          if (char === '\u0003') {
            // Ctrl+C
            process.stdin.setRawMode(wasRaw || false);
            process.stdout.write('\n');
            process.exit(130);
          }
          if (char === '\r' || char === '\n') {
            process.stdin.removeListener('data', onData);
            process.stdin.setRawMode(wasRaw || false);
            process.stdin.pause();
            process.stdout.write('\n');
            resolve(password);
            return;
          }
          if (char === '\u0008' || char === '\x7f') {
            // Backspace / Delete
            if (password.length > 0) {
              password = password.slice(0, -1);
              process.stdout.write('\b \b');
            }
          } else if (char.charCodeAt(0) >= 32) {
            password += char;
            process.stdout.write('*');
          }
        }
      };

      process.stdin.on('data', onData);
    });
  }

  close() {
    if (this.rl) {
      this.rl.close();
    }
  }
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Usage:
  npm run admin:create [options]

Options:
  --email=<email>       Admin email (prompts in terminal if omitted)
  --password=<pass>     Admin password (prompts in terminal if omitted)
  --role=<role>         Role: ADMIN or SUPER_ADMIN (default: ADMIN)
  --name=<name>         Full name (default: "Admin User")
  -h, --help            Show help
`);
    return;
  }

  let email = getArg('email') || process.env.ADMIN_EMAIL;
  let password = getArg('password') || process.env.ADMIN_PASSWORD;
  const roleInput = (getArg('role') || process.env.ADMIN_ROLE || 'ADMIN').toUpperCase();
  const fullName = getArg('name') || process.env.ADMIN_NAME || 'Admin User';

  const prompter = new TerminalPrompter();

  try {
    if (!email) {
      while (!email) {
        const input = await prompter.ask('Enter admin email: ');
        if (!input) {
          if (!process.stdin.isTTY) {
            console.error('Error: Email is required.');
            process.exit(1);
          }
          console.log('Email is required. Please try again.');
          continue;
        }
        if (!input.includes('@') || !input.includes('.')) {
          if (!process.stdin.isTTY) {
            console.error('Error: Invalid email format.');
            process.exit(1);
          }
          console.log('Please enter a valid email address (e.g. admin@mentoraura.com).');
          continue;
        }
        email = input;
      }
    } else if (!email.includes('@') || !email.includes('.')) {
      console.error('Error: Invalid email format provided.');
      process.exit(1);
    }

    if (!password) {
      while (!password) {
        const input = await prompter.askPassword('Enter admin password: ');
        if (!input) {
          if (!process.stdin.isTTY) {
            console.error('Error: Password is required.');
            process.exit(1);
          }
          console.log('Password is required. Please try again.');
          continue;
        }
        if (input.length < 8) {
          if (!process.stdin.isTTY) {
            console.error('Error: Password must be at least 8 characters long.');
            process.exit(1);
          }
          console.log('Password must be at least 8 characters long. Please try again.');
          continue;
        }
        password = input;
      }
    } else if (password.length < 8) {
      console.error('Error: Password must be at least 8 characters long.');
      process.exit(1);
    }
  } finally {
    prompter.close();
  }

  const role = roleInput === 'SUPER_ADMIN' ? UserRole.SUPER_ADMIN : UserRole.ADMIN;
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: {
      passwordHash,
      role,
      isActive: true,
      isEmailVerified: true,
    },
    create: {
      email: email.toLowerCase(),
      passwordHash,
      role,
      isActive: true,
      isEmailVerified: true,
    },
  });

  await prisma.menteeProfile.upsert({
    where: { userId: admin.id },
    update: { fullName },
    create: {
      userId: admin.id,
      fullName,
    },
  });

  console.log(`[AdminCLI] Successfully created/promoted ${admin.email} with role ${admin.role} (ID: ${admin.id})`);
}

main()
  .catch((err) => {
    console.error('[AdminCLI] Execution error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
