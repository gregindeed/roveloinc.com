'use client'

import { useState } from 'react'
import Avatar from '@/components/Avatar'
import { useT } from '@/components/I18nProvider'
import { inviteTeamMember, updateMemberAccess, removeMember } from '@/app/admin/team/actions'

type ClientLite = { id: string; name: string }
type Member = {
  id: string
  email: string
  name?: string | null
  online?: boolean
  roleLabel: string
  role: 'admin' | 'collaborator'
  isOwner: boolean
  isYou: boolean
  grantIds: string[]
}

const inputCls =
  'border border-gray-200 rounded-lg px-2.5 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white'

function EntityChecks({ clients, checked }: { clients: ClientLite[]; checked: string[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-1">
      {clients.map((c) => (
        <label key={c.id} className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            name="entity_ids"
            value={c.id}
            defaultChecked={checked.includes(c.id)}
            className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
          />
          {c.name}
        </label>
      ))}
    </div>
  )
}

function InviteForm({ clients }: { clients: ClientLite[] }) {
  const t = useT()
  const [type, setType] = useState<'manager' | 'collaborator'>('collaborator')
  return (
    <form action={inviteTeamMember} className="border border-gray-200 rounded-xl p-4 space-y-3">
      <h2 className="text-sm font-semibold text-gray-900">{t('team.inviteTeamMember')}</h2>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <span className="text-[11px] font-medium text-gray-600">{t('team.email')}</span>
          <input name="email" type="email" required placeholder="name@example.com" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-gray-600">{t('team.access')}</span>
          <select value={type} onChange={(e) => setType(e.target.value as 'manager' | 'collaborator')} name="type" className={inputCls}>
            <option value="collaborator">{t('team.collaboratorOption')}</option>
            <option value="manager">{t('team.managerOption')}</option>
          </select>
        </label>
      </div>
      {type === 'collaborator' && (
        <div>
          <span className="text-[11px] font-medium text-gray-600">{t('team.entitiesTheyAccess')}</span>
          {clients.length ? (
            <EntityChecks clients={clients} checked={[]} />
          ) : (
            <p className="text-xs text-gray-400 mt-1">{t('team.noEntities')}</p>
          )}
        </div>
      )}
      <button className="text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors">
        {t('team.sendInvite')}
      </button>
    </form>
  )
}

function EditForm({ member, clients }: { member: Member; clients: ClientLite[] }) {
  const t = useT()
  const [type, setType] = useState<'manager' | 'collaborator'>(member.role === 'admin' ? 'manager' : 'collaborator')
  return (
    <form action={updateMemberAccess.bind(null, member.id)} className="mt-2 rounded-lg border border-gray-200 bg-gray-50/60 p-3 space-y-2">
      <label className="flex flex-col gap-1 max-w-xs">
        <span className="text-[11px] font-medium text-gray-600">{t('team.access')}</span>
        <select value={type} onChange={(e) => setType(e.target.value as 'manager' | 'collaborator')} name="type" className={inputCls}>
          <option value="collaborator">{t('team.collaboratorOption')}</option>
          <option value="manager">{t('team.managerOption')}</option>
        </select>
      </label>
      {type === 'collaborator' && <EntityChecks clients={clients} checked={member.grantIds} />}
      <button className="text-xs font-medium text-gray-900 hover:text-gray-500 transition-colors">{t('team.saveAccess')}</button>
    </form>
  )
}

export default function TeamManager({ members, clients }: { members: Member[]; clients: ClientLite[] }) {
  const t = useT()
  const [editing, setEditing] = useState<string | null>(null)
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? '—'

  return (
    <div className="space-y-6">
      <InviteForm clients={clients} />

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-[11px] font-medium uppercase tracking-wide text-gray-500">
          {t('team.count', { n: members.length })}
        </div>
        {members.map((m) => (
          <div key={m.id} className="px-4 py-3 border-b border-gray-100 last:border-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <Avatar name={m.name || m.email} email={m.email} online={m.online} size={32} />
                <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900">
                  {m.name || m.email} {m.isYou && <span className="text-xs text-gray-400">{t('team.you')}</span>}
                </div>
                {m.name && <div className="text-[11px] text-gray-400 truncate">{m.email}</div>}
                <div className="text-xs text-gray-500 mt-0.5">
                  {m.roleLabel}
                  {m.role === 'collaborator' && (
                    <span className="text-gray-400">
                      {' · '}
                      {m.grantIds.length ? m.grantIds.map(clientName).join(', ') : t('team.noEntitiesInline')}
                    </span>
                  )}
                </div>
                </div>
              </div>
              {!m.isOwner && (
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => setEditing(editing === m.id ? null : m.id)}
                    className="text-xs font-medium text-gray-700 hover:text-gray-900"
                  >
                    {editing === m.id ? t('team.close') : t('team.editAccess')}
                  </button>
                  <form action={removeMember.bind(null, m.id)}>
                    <button className="text-xs font-medium text-red-600 hover:text-red-700">{t('team.remove')}</button>
                  </form>
                </div>
              )}
            </div>
            {editing === m.id && !m.isOwner && <EditForm member={m} clients={clients} />}
          </div>
        ))}
      </div>
    </div>
  )
}
