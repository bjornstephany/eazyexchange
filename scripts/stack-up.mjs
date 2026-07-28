#!/usr/bin/env node
// Exit 0 when the local Supabase stack answers, 1 otherwise. The pre-push
// hook's predicate: it decides whether test:rls can run here or has to be left
// to CI (scripts/hooks/pre-push).
import { stackIsUp } from './lib/stack.mjs'

process.exit((await stackIsUp()) ? 0 : 1)
