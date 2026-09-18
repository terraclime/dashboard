import bcrypt from "bcryptjs";

const password = process.argv[2];
const rounds = Number(process.argv[3] || 10);

if (!password) {
  console.error("Usage: npm run hash-password -- <plain-password> [salt-rounds]");
  process.exit(1);
}

if (!Number.isInteger(rounds) || rounds < 4 || rounds > 15) {
  console.error("salt-rounds must be an integer between 4 and 15");
  process.exit(1);
}

const hash = await bcrypt.hash(password, rounds);

console.log(hash);
