import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from '../../auth/dto/register.dto';
import {
  AccountActionDto,
  CreateUserDto,
  EditUserDto,
} from './manage-user.dto';

describe.each([
  ['register', RegisterDto, { email: 'synthetic@example.test' }],
  [
    'create',
    CreateUserDto,
    { email: 'synthetic@example.test', firstName: 'Prueba', role: 'VENDEDOR' },
  ],
  ['edit', EditUserDto, { version: 1 }],
  ['restore', AccountActionDto, { version: 1 }],
] as const)('%s password policy', (_name, Dto, fields) => {
  const errors = async (password: string) =>
    (
      await validate(
        plainToInstance<object, object>(Dto, { ...fields, password }),
      )
    ).filter((error) => error.property === 'password');

  it('accepts exactly eight characters and rejects seven', async () => {
    expect(await errors('Abc12345')).toHaveLength(0);
    expect(await errors('Abc1234')).toHaveLength(1);
  });
  it('preserves the maximum of 72 UTF-8 bytes', async () => {
    expect(await errors('a'.repeat(72))).toHaveLength(0);
    expect(await errors('a'.repeat(73))).toHaveLength(1);
    expect(await errors('á'.repeat(36))).toHaveLength(0);
    expect(await errors('á'.repeat(37))).toHaveLength(1);
  });
});
