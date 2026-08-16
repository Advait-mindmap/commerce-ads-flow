import React, { useEffect, useState } from 'react';
import { Check, Loader2, UserPlus } from 'lucide-react';
import { api } from '@/api/client';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/AuthContext';

/**
 * Assigns work to any member of the team, not just the signed-in user.
 *
 * The roster comes from the users table via /api/auth/team and is filtered to
 * roles that actually carry a lead queue, so the list can never offer someone
 * who could not action the assignment.
 */
export default function AssigneePicker({
  currentName = null,
  onAssign,
  disabled = false,
  size = 'sm',
  variant = 'outline',
  label = 'Assign to',
  // Narrows the roster to the roles that can actually own this work. Offering
  // an analyst as the owner of a retention call is worse than offering nobody.
  roles = null
}) {
  const [members, setMembers] = useState(null);
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    api.auth.team()
      .then((res) => {
        const all = res.members || [];
        setMembers(roles ? all.filter((m) => roles.includes(m.role)) : all);
      })
      .catch(() => setMembers([]));
  }, [roles]);

  const assign = async (member) => {
    setBusy(true);
    try {
      await onAssign(member);
    } finally {
      setBusy(false);
    }
  };

  const me = members?.find((m) => m.id === user?.id) || null;
  const others = (members || []).filter((m) => m.id !== user?.id);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size} variant={variant} className="h-8 text-xs" disabled={disabled || busy}>
          {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5 mr-1.5" />}
          {currentName ? `Owner: ${currentName}` : label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {members === null && <div className="px-2 py-3 text-xs text-slate-500">Loading team…</div>}

        {members !== null && members.length === 0 && (
          <div className="px-2 py-3 text-xs text-slate-500">No assignable team members found.</div>
        )}

        {me && (
          <>
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-slate-500">You</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => assign(me)} className="text-xs cursor-pointer">
              <span className="flex-1 min-w-0">
                <span className="block truncate">{me.name}</span>
                <span className="block text-[11px] text-slate-500">{me.role_label}</span>
              </span>
              {currentName === me.name && <Check className="w-3.5 h-3.5 text-blue-800 shrink-0" />}
            </DropdownMenuItem>
          </>
        )}

        {others.length > 0 && (
          <>
            {me && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-slate-500">Team</DropdownMenuLabel>
            {others.map((m) => (
              <DropdownMenuItem key={m.id} onClick={() => assign(m)} className="text-xs cursor-pointer">
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{m.name}</span>
                  <span className="block text-[11px] text-slate-500">{m.role_label}</span>
                </span>
                {currentName === m.name && <Check className="w-3.5 h-3.5 text-blue-800 shrink-0" />}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
