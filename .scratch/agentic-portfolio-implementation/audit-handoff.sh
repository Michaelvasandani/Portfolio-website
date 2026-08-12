#!/usr/bin/env bash

set -euo pipefail

package_dir=$(cd "$(dirname "$0")" && pwd)
spec_file="$package_dir/spec.md"
matrix_file="$package_dir/traceability.md"
issues_dir="$package_dir/issues"
decision_dir="$package_dir/../agentic-portfolio/issues"
audit_tmp=$(mktemp -d)
trap 'rm -rf "$audit_tmp"' EXIT

failures=0

fail() {
  printf 'FAIL: %s\n' "$1"
  failures=$((failures + 1))
}

pass() {
  printf 'PASS: %s\n' "$1"
}

rg -o '^### [A-Z]{3}-[0-9]{3}' "$spec_file" | sed 's/^### //' | sort -u > "$audit_tmp/spec-reqs"
rg -o '^\| [A-Z]{3}-[0-9]{3} ' "$matrix_file" | sed -E 's/^\| ([A-Z]{3}-[0-9]{3}) /\1/' | sort -u > "$audit_tmp/matrix-reqs"

: > "$audit_tmp/ticket-reqs"
for ticket in "$issues_dir"/*.md; do
  sed -n '/^## Requirements$/,$p' "$ticket" | rg -o '[A-Z]{3}-[0-9]{3}' || true
done | sort -u > "$audit_tmp/ticket-reqs"

if cmp -s "$audit_tmp/spec-reqs" "$audit_tmp/matrix-reqs"; then
  pass "specification and traceability contain the same requirement IDs ($(wc -l < "$audit_tmp/spec-reqs" | tr -d ' '))"
else
  fail "specification and traceability requirement IDs differ"
  comm -3 "$audit_tmp/spec-reqs" "$audit_tmp/matrix-reqs"
fi

if cmp -s "$audit_tmp/spec-reqs" "$audit_tmp/ticket-reqs"; then
  pass "every requirement is assigned and tickets declare no unsupported requirement"
else
  fail "ticket requirements differ from specification requirements"
  comm -3 "$audit_tmp/spec-reqs" "$audit_tmp/ticket-reqs"
fi

ticket_count=$(find "$issues_dir" -maxdepth 1 -name '*.md' | wc -l | tr -d ' ')
if [[ "$ticket_count" == "11" ]]; then
  pass "eleven implementation tickets exist"
else
  fail "expected 11 implementation tickets, found $ticket_count"
fi

for ticket in "$issues_dir"/*.md; do
  ticket_name=$(basename "$ticket")
  ticket_number=${ticket_name%%-*}
  status=$(sed -n 's/^Status: //p' "$ticket")
  case "$status" in
    ready-for-agent|ready-for-human|complete) ;;
    *) fail "$ticket_name has invalid or missing triage status '$status'" ;;
  esac

  for heading in Outcome Included Excluded "Acceptance checks" "Acceptance evidence" "Failure and recovery" Requirements; do
    if ! rg -q "^## $heading$" "$ticket"; then
      fail "$ticket_name is missing ## $heading"
    fi
  done

  blocker_line=$(sed -n 's/^Blocked by: //p' "$ticket")
  if [[ -z "$blocker_line" ]]; then
    fail "$ticket_name is missing Blocked by"
    continue
  fi
  if [[ "$blocker_line" == "none" ]]; then
    continue
  fi

  while IFS= read -r blocker; do
    [[ -z "$blocker" ]] && continue
    if ! compgen -G "$issues_dir/$blocker-*.md" > /dev/null; then
      fail "$ticket_name references missing blocker $blocker"
    elif ((10#$blocker >= 10#$ticket_number)); then
      fail "$ticket_name has non-preceding blocker $blocker"
    fi
  done < <(printf '%s\n' "$blocker_line" | rg -o '[0-9]{2}' || true)
done
pass "ticket structure and dependency targets inspected"

find "$decision_dir" -maxdepth 1 -name '*.md' -exec basename {} \; | sort > "$audit_tmp/decision-files"
rg -o '\.\./agentic-portfolio/issues/[0-9]{2}-[^)]+\.md' "$matrix_file" | sed 's#^.*/##' | sort -u > "$audit_tmp/traced-decisions"
if cmp -s "$audit_tmp/decision-files" "$audit_tmp/traced-decisions"; then
  pass "all resolved Wayfinder decision files are represented in traceability"
else
  fail "Wayfinder decision coverage differs"
  comm -3 "$audit_tmp/decision-files" "$audit_tmp/traced-decisions"
fi

for document in "$package_dir"/*.md "$package_dir"/fixtures/*.md "$package_dir"/runbooks/*.md "$issues_dir"/*.md; do
  document_dir=$(dirname "$document")
  while IFS= read -r markdown_target; do
    target=${markdown_target#](}
    target=${target%)}
    target=${target%%#*}
    [[ -z "$target" ]] && continue
    case "$target" in
      http://*|https://*|mailto:*) continue ;;
    esac
    if [[ ! -e "$document_dir/$target" ]]; then
      fail "broken local link in ${document#"$package_dir/"}: $target"
    fi
  done < <(rg --no-filename -o '\]\([^)]+\)' "$document" || true)
done
pass "local Markdown links inspected"

for runbook in Provisioning "Credential rotation" "Normal publication" Monitoring "Incident response" "Rollback and verification" "Circuit-breaker clearance" "Manual restore" Retention "Backup and database recovery" Decommissioning; do
  if ! rg -q "^## $runbook$" "$package_dir/runbooks/README.md"; then
    fail "missing runbook: $runbook"
  fi
done
pass "required operator and human-owned checklists inspected"

if ((failures > 0)); then
  printf '\nHandoff audit failed with %s issue(s).\n' "$failures"
  exit 1
fi

printf '\nHandoff audit passed: no orphan requirements, unsupported ticket requirements, missing dependencies, broken local links, unrepresented decisions, or missing runbooks found.\n'
