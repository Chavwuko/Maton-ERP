import 'reflect-metadata';
import { Public, IS_PUBLIC_KEY } from './public.decorator';

describe('Public decorator', () => {
  it('marks the decorated handler with isPublic metadata set to true', () => {
    class TestController {
      @Public()
      handler() {}
    }

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, TestController.prototype.handler)).toBe(true);
  });

  it('leaves an undecorated handler with no isPublic metadata', () => {
    class TestController {
      handler() {}
    }

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, TestController.prototype.handler)).toBeUndefined();
  });
});
