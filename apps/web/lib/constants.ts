// Daily-minutes budget assigned when a schedule is created for a domain that
// has no existing rule yet, so the new TimeLimit never lands on the
// dailyLimit: null ("unconditionally blocked") state a schedule can't attach to.
export const DEFAULT_DAILY_LIMIT_MINUTES = 30
