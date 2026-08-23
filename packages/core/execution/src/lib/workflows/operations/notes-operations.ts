import dayjs from 'dayjs'
import { WorkflowVersion } from '../workflow-version'
import { Note } from '../note'
import { AddNoteRequest, DeleteNoteRequest, UpdateNoteRequest } from '.'

const _updateNote = (workflowVersion: WorkflowVersion, request: UpdateNoteRequest): WorkflowVersion => {
    const newWorkflowVersion = JSON.parse(JSON.stringify(workflowVersion))
    newWorkflowVersion.notes = newWorkflowVersion.notes.map((note: Note) => {
        if (note.id === request.id) {
            return { ...note, ...request, updatedAt: dayjs().toISOString() }
        }
        return note
    })
    return newWorkflowVersion
}

const _deleteNote = (workflowVersion: WorkflowVersion, request: DeleteNoteRequest): WorkflowVersion => {
    const newWorkflowVersion = JSON.parse(JSON.stringify(workflowVersion))
    newWorkflowVersion.notes = newWorkflowVersion.notes.filter((note: Note) => note.id !== request.id)
    return newWorkflowVersion
}

const _addNote = (workflowVersion: WorkflowVersion, request: AddNoteRequest): WorkflowVersion => {
    const newWorkflowVersion = JSON.parse(JSON.stringify(workflowVersion))
    newWorkflowVersion.notes.push({ ...request, createdAt: dayjs().toISOString(), updatedAt: dayjs().toISOString() })
    return newWorkflowVersion
}

export const notesOperations = {
    updateNote: _updateNote,
    deleteNote: _deleteNote,
    addNote: _addNote,
}