import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Role } from '@prisma/client';
import { AllowWithoutMfa } from '../../src/common/decorators/allow-without-mfa.decorator';
import { OptionalAuth } from '../../src/common/decorators/optional-auth.decorator';
import { Public } from '../../src/common/decorators/public.decorator';
import { Roles } from '../../src/common/decorators/roles.decorator';

export interface RegisteredRoute {
  /** "GET /teacher/courses/:courseId" */
  key: string;
  method: string;
  path: string;
  controller: string;
  handler: string;
  isPublic: boolean;
  optionalAuth: boolean;
  allowWithoutMfa: boolean;
  roles: Role[];
}

function join(...parts: string[]): string {
  const path = parts
    .flatMap((p) => p.split('/'))
    .filter(Boolean)
    .join('/');
  return `/${path}`;
}

/**
 * Every route the Nest router registered, read from the controllers' metadata (the same metadata
 * the router and the global guards use), with the access decorators that apply to it.
 */
export function registeredRoutes(app: NestExpressApplication): RegisteredRoute[] {
  const discovery = new DiscoveryService(app.get(ModulesContainer));
  const scanner = new MetadataScanner();
  const reflector = app.get(Reflector);
  const routes: RegisteredRoute[] = [];

  for (const wrapper of discovery.getControllers()) {
    const instance = wrapper.instance as object | undefined;
    const metatype = wrapper.metatype as (new (...args: unknown[]) => unknown) | undefined;
    if (!instance || !metatype) continue;
    const prefixes = [Reflect.getMetadata(PATH_METADATA, metatype) ?? '/'].flat() as string[];
    const prototype = Object.getPrototypeOf(instance) as Record<string, unknown>;

    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[name] as (...args: unknown[]) => unknown;
      const paths = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (paths === undefined || method === undefined) continue;
      const targets = [handler, metatype];
      for (const prefix of prefixes) {
        for (const path of [paths].flat()) {
          const full = join(prefix, path);
          const verb = RequestMethod[method];
          routes.push({
            key: `${verb} ${full}`,
            method: verb,
            path: full,
            controller: metatype.name,
            handler: name,
            isPublic: reflector.getAllAndOverride(Public, targets) === true,
            optionalAuth: reflector.getAllAndOverride(OptionalAuth, targets) === true,
            allowWithoutMfa: reflector.getAllAndOverride(AllowWithoutMfa, targets) === true,
            roles: reflector.getAllAndOverride(Roles, targets) ?? [],
          });
        }
      }
    }
  }
  return routes.sort((a, b) => a.key.localeCompare(b.key));
}

/** Replaces `:param` placeholders from a map; unknown params fall back to `fallback`. */
export function fillPath(
  path: string,
  params: Record<string, string>,
  fallback = '00000000-0000-4000-8000-000000000000',
): string {
  return path.replace(/:(\w+)/g, (_, name: string) => params[name] ?? fallback);
}
