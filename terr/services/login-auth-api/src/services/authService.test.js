import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import {
  login,
  validateLoginPayload,
  AuthUnauthorizedError,
  AuthValidationError,
} from "./authService.js";

test("validateLoginPayload accepts the existing client payload", () => {
  const credentials = validateLoginPayload({
    user_mail: "hari@terraclime.com",
    user_password: "Qwerty123459@",
  });

  assert.deepEqual(credentials, {
    userMail: "hari@terraclime.com",
    password: "Qwerty123459@",
  });
});

test("validateLoginPayload rejects empty credentials", () => {
  assert.throws(
    () => validateLoginPayload({ user_mail: "", user_password: "" }),
    AuthValidationError
  );
});

test("login returns a token payload and apartment metadata", async () => {
  const password = "Qwerty123459@";
  const hash = await bcrypt.hash(password, 10);
  const sentCommands = [];

  const result = await login(
    {
      userMail: "hari@terraclime.com",
      password,
    },
    {
      client: {
        async send(command) {
          sentCommands.push(command);

          return {
            Item: {
              user_mail: "hari@terraclime.com",
              apartment_id: "SOBCH1TER",
              apartmentName: "SOBHA APARTMENTS",
              hash_password: hash,
              role: "user",
              user_status: "Active",
            },
          };
        },
      },
      signToken(payload, secret, options) {
        assert.equal(payload.user_mail, "hari@terraclime.com");
        assert.equal(payload.apartment_id, "SOBCH1TER");
        assert.equal(payload.role, "user");
        assert.equal(typeof secret, "string");
        assert.equal(options.expiresIn, "2h");
        return "signed-jwt";
      },
    }
  );

  assert.equal(sentCommands.length, 1);
  assert.equal(result.accessToken, "signed-jwt");
  assert.equal(result.role, "user");
  assert.equal(result.account_type, "standard");
  assert.deepEqual(result.apartment, {
    id: "SOBCH1TER",
    name: "SOBHA APARTMENTS",
  });
  assert.deepEqual(result.user, {
    mail: "hari@terraclime.com",
    first_name: "",
    last_name: "",
  });
});

test("login rejects invalid passwords", async () => {
  const hash = await bcrypt.hash("DifferentPassword123!", 10);

  await assert.rejects(
    () =>
      login(
        {
          userMail: "hari@terraclime.com",
          password: "Qwerty123459@",
        },
        {
          client: {
            async send() {
              return {
                Item: {
                  user_mail: "hari@terraclime.com",
                  hash_password: hash,
                  role: "user",
                },
              };
            },
          },
        }
      ),
    AuthUnauthorizedError
  );
});

test("login rejects inactive users", async () => {
  const password = "Qwerty123459@";
  const hash = await bcrypt.hash(password, 10);

  await assert.rejects(
    () =>
      login(
        {
          userMail: "hari@terraclime.com",
          password,
        },
        {
          client: {
            async send() {
              return {
                Item: {
                  user_mail: "hari@terraclime.com",
                  hash_password: hash,
                  role: "102",
                  user_status: "Inactive",
                },
              };
            },
          },
        }
      ),
    AuthUnauthorizedError
  );
});
