import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'next/server') return next('next/server.js', context);
  if (specifier.startsWith('@/')) return next(pathToFileURL(`${process.cwd()}/${specifier.slice(2)}.ts`).href, context);
  return next(specifier, context);
}});
