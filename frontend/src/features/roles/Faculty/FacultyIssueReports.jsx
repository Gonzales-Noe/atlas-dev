import { useCallback, useEffect, useRef, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import FacultyLayout from './FacultyLayout'
import api from '../../../config/api'
import { StatusNotice } from '../../../components/StatusNotice'
import { PageHeader, PrimaryBtn, OutlineBtn } from '../../../components/ui'
import {
  IssueReportsBoard,
  ReportDetailDialog,
  SubmitIssueDialog,
} from '../../support/issueReportUi'

export default function FacultyIssueReports() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitOpen, setSubmitOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [selected, setSelected] = useState(null)
  const hasLoadedRef = useRef(false)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent || !hasLoadedRef.current) setLoading(true)
    try {
      const { data } = await api.get('/auth/support-reports/', {
        atlasCache: false,
        params: { include_images: 1 },
      })
      setReports(Array.isArray(data?.reports) ? data.reports : [])
      hasLoadedRef.current = true
      if (!silent) setError('')
    } catch (err) {
      if (!silent || !hasLoadedRef.current) {
        setError(err?.response?.data?.detail || 'Could not load your reports. Try again in a moment.')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const soft = () => load({ silent: true })
    const timer = window.setInterval(soft, 30000)
    const onFocus = () => soft()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

  function openCreate() {
    setEditing(null)
    setSubmitOpen(true)
    setError('')
    setSuccess('')
  }

  function openEdit(row) {
    setSelected(null)
    setEditing(row)
    setSubmitOpen(true)
    setError('')
    setSuccess('')
  }

  function handleSubmitted(data, wasEdit) {
    if (wasEdit) {
      setReports((rows) => rows.map((row) => (row.id === data.id ? { ...row, ...data } : row)))
      setSuccess('Your report was updated.')
    } else {
      setReports((rows) => [data, ...rows.filter((row) => row.id !== data.id)])
      setSuccess(
        data?.delivered_to === 'superadmin'
          ? 'Your message was sent to the ATLAS team.'
          : 'Your message was sent to your campus admin.',
      )
    }
    setError('')
    load({ silent: true })
  }

  return (
    <FacultyLayout>
      <StatusNotice message={error} severity="error" />
      <StatusNotice message={success} severity="success" />

      <PageHeader
        title="Issue reports"
        subtitle="Tell your campus admin what went wrong. They can send it to the ATLAS team if more help is needed."
        action={(
          <PrimaryBtn onClick={openCreate}>
            <AddIcon sx={{ fontSize: 18 }} />
            Report an issue
          </PrimaryBtn>
        )}
      />

      <IssueReportsBoard
        reports={reports}
        loading={loading}
        forFaculty
        emptyText="You have not sent any issue reports yet."
        onOpen={setSelected}
      />

      <SubmitIssueDialog
        open={submitOpen}
        existing={editing}
        onClose={() => {
          setSubmitOpen(false)
          setEditing(null)
        }}
        onSubmitted={handleSubmitted}
      />

      <ReportDetailDialog
        open={Boolean(selected)}
        report={selected}
        forFaculty
        onClose={() => setSelected(null)}
        footer={selected?.can_edit ? (
          <OutlineBtn onClick={() => openEdit(selected)}>Edit</OutlineBtn>
        ) : null}
      />
    </FacultyLayout>
  )
}
