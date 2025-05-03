/*
 * ServerNotes plugin for Vencord
 * Add personal notes to Discord servers, channels, or users
 */

import "./ServerNotes.css";

import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy, findComponentByCodeLazy } from "@webpack";
import { Button, ContextMenuApi, FluxDispatcher, Forms, Menu, React, Tooltip, useEffect, useState } from "@webpack/common";
import { User, Channel, Guild } from "discord-types/general";

// Types for notes
interface NoteData {
    content: string;
    createdAt: number;
    updatedAt: number;
}

interface UserNote extends NoteData {
    userId: string;
}

interface ChannelNote extends NoteData {
    channelId: string;
}

interface ServerNote extends NoteData {
    guildId: string;
}

// Combined type for all notes
type Note = UserNote | ChannelNote | ServerNote;

// Plugin settings
const settings = definePluginSettings({
    showNotesInTooltips: {
        type: OptionType.BOOLEAN,
        description: "Show notes in tooltips when hovering over servers, channels, or users",
        default: true
    },
    noteIconColor: {
        type: OptionType.STRING,
        description: "Color of the note indicator icon",
        default: "#ffcc00"
    }
});

// Get necessary Discord modules
const UserPopoutModule = findByPropsLazy("UserPopoutComponents");
const ServerContextMenuModule = findByPropsLazy("GuildContextMenu");
const ChannelContextMenuModule = findByPropsLazy("ChannelListTextChannelContextMenu", "ChannelListVoiceChannelContextMenu");

// Storage for notes
const STORAGE_KEY = "vc-server-notes";

// Helper function to save notes to localStorage
function saveNotes(notes: Record<string, Note>): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    } catch (error) {
        console.error("[ServerNotes] Error saving notes:", error);
    }
}

// Helper function to load notes from localStorage
function loadNotes(): Record<string, Note> {
    try {
        const savedNotes = localStorage.getItem(STORAGE_KEY);
        if (!savedNotes) return {};
        
        return JSON.parse(savedNotes);
    } catch (error) {
        console.error("[ServerNotes] Error loading notes:", error);
        return {};
    }
}

// State for notes
let notes: Record<string, Note> = {};

// Component for the note modal
function NoteModal({ 
    type, 
    id, 
    name, 
    existingNote, 
    onSave, 
    onClose 
}: { 
    type: "server" | "channel" | "user", 
    id: string, 
    name: string, 
    existingNote?: string, 
    onSave: (content: string) => void, 
    onClose: () => void 
}) {
    const [noteContent, setNoteContent] = useState(existingNote || "");
    
    return (
        <div className="vc-server-notes-modal">
            <div className="vc-server-notes-modal-header">
                <div className="vc-server-notes-modal-title">
                    {existingNote ? "Edit" : "Add"} Note for {type}: {name}
                </div>
                <div className="vc-server-notes-modal-close" onClick={onClose}>×</div>
            </div>
            <div className="vc-server-notes-modal-content">
                <textarea
                    className="vc-server-notes-modal-textarea"
                    value={noteContent}
                    onChange={e => setNoteContent(e.target.value)}
                    placeholder={`Enter your notes for this ${type}...`}
                    autoFocus
                />
            </div>
            <div className="vc-server-notes-modal-footer">
                <button 
                    className="vc-server-notes-modal-button vc-server-notes-modal-button-secondary" 
                    onClick={onClose}
                >
                    Cancel
                </button>
                <button 
                    className="vc-server-notes-modal-button vc-server-notes-modal-button-primary" 
                    onClick={() => {
                        onSave(noteContent);
                        onClose();
                    }}
                    disabled={!noteContent.trim()}
                >
                    Save
                </button>
            </div>
        </div>
    );
}

// Context menu components for adding/editing notes
const UserContextMenu = ({ userId, user }) => {
    const noteKey = `user-${userId}`;
    const hasNote = notes[noteKey] !== undefined;
    
    return (
        <Menu.MenuItem
            id="server-notes-user"
            label={hasNote ? "Edit Note" : "Add Note"}
            icon="Pencil"
            action={() => {
                const modal = document.createElement("div");
                modal.className = "vc-server-notes-modal-overlay";
                document.body.appendChild(modal);
                
                function handleClose() {
                    document.body.removeChild(modal);
                }
                
                function handleSave(content: string) {
                    const now = Date.now();
                    const noteData: UserNote = {
                        userId,
                        content,
                        createdAt: hasNote ? notes[noteKey].createdAt : now,
                        updatedAt: now
                    };
                    
                    notes[noteKey] = noteData;
                    saveNotes(notes);
                }
                
                React.render(
                    <NoteModal 
                        type="user"
                        id={userId}
                        name={user.username}
                        existingNote={hasNote ? notes[noteKey].content : ""}
                        onSave={handleSave}
                        onClose={handleClose}
                    />,
                    modal
                );
            }}
        />
    );
};

const ChannelContextMenu = ({ channelId, channel }) => {
    const noteKey = `channel-${channelId}`;
    const hasNote = notes[noteKey] !== undefined;
    
    return (
        <Menu.MenuItem
            id="server-notes-channel"
            label={hasNote ? "Edit Note" : "Add Note"}
            icon="Pencil"
            action={() => {
                const modal = document.createElement("div");
                modal.className = "vc-server-notes-modal-overlay";
                document.body.appendChild(modal);
                
                function handleClose() {
                    document.body.removeChild(modal);
                }
                
                function handleSave(content: string) {
                    const now = Date.now();
                    const noteData: ChannelNote = {
                        channelId,
                        content,
                        createdAt: hasNote ? notes[noteKey].createdAt : now,
                        updatedAt: now
                    };
                    
                    notes[noteKey] = noteData;
                    saveNotes(notes);
                }
                
                React.render(
                    <NoteModal 
                        type="channel"
                        id={channelId}
                        name={channel.name}
                        existingNote={hasNote ? notes[noteKey].content : ""}
                        onSave={handleSave}
                        onClose={handleClose}
                    />,
                    modal
                );
            }}
        />
    );
};

const ServerContextMenu = ({ guildId, guild }) => {
    const noteKey = `server-${guildId}`;
    const hasNote = notes[noteKey] !== undefined;
    
    return (
        <Menu.MenuItem
            id="server-notes-server"
            label={hasNote ? "Edit Note" : "Add Note"}
            icon="Pencil"
            action={() => {
                const modal = document.createElement("div");
                modal.className = "vc-server-notes-modal-overlay";
                document.body.appendChild(modal);
                
                function handleClose() {
                    document.body.removeChild(modal);
                }
                
                function handleSave(content: string) {
                    const now = Date.now();
                    const noteData: ServerNote = {
                        guildId,
                        content,
                        createdAt: hasNote ? notes[noteKey].createdAt : now,
                        updatedAt: now
                    };
                    
                    notes[noteKey] = noteData;
                    saveNotes(notes);
                }
                
                React.render(
                    <NoteModal 
                        type="server"
                        id={guildId}
                        name={guild.name}
                        existingNote={hasNote ? notes[noteKey].content : ""}
                        onSave={handleSave}
                        onClose={handleClose}
                    />,
                    modal
                );
            }}
        />
    );
};

// Component for notes manager
function NotesManager({ onClose }: { onClose: () => void }) {
    const [activeTab, setActiveTab] = useState<"servers" | "channels" | "users">("servers");
    const [searchQuery, setSearchQuery] = useState("");
    const [allNotes, setAllNotes] = useState<Record<string, Note>>(notes);
    
    // Filter notes based on type and search query
    const filteredNotes = Object.entries(allNotes).filter(([key, note]) => {
        const matchesType = 
            (activeTab === "servers" && key.startsWith("server-")) ||
            (activeTab === "channels" && key.startsWith("channel-")) ||
            (activeTab === "users" && key.startsWith("user-"));
            
        if (!matchesType) return false;
        
        if (!searchQuery) return true;
        
        return note.content.toLowerCase().includes(searchQuery.toLowerCase());
    });
    
    // Sort notes by last updated
    const sortedNotes = filteredNotes.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
    
    // Delete a note
    const deleteNote = (key: string) => {
        if (confirm("Are you sure you want to delete this note?")) {
            const updatedNotes = { ...allNotes };
            delete updatedNotes[key];
            setAllNotes(updatedNotes);
            notes = updatedNotes;
            saveNotes(notes);
        }
    };
    
    // Edit a note
    const editNote = (key: string, type: "server" | "channel" | "user", name: string) => {
        const existingNote = allNotes[key];
        
        const modal = document.createElement("div");
        modal.className = "vc-server-notes-modal-overlay";
        document.body.appendChild(modal);
        
        function handleClose() {
            document.body.removeChild(modal);
        }
        
        function handleSave(content: string) {
            const now = Date.now();
            const updatedNote = {
                ...existingNote,
                content,
                updatedAt: now
            };
            
            const updatedNotes = { ...allNotes, [key]: updatedNote };
            setAllNotes(updatedNotes);
            notes = updatedNotes;
            saveNotes(notes);
        }
        
        React.render(
            <NoteModal 
                type={type}
                id={key.split("-")[1]}
                name={name}
                existingNote={existingNote.content}
                onSave={handleSave}
                onClose={handleClose}
            />,
            modal
        );
    };
    
    // Format date
    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleString();
    };
    
    // Get entity name (attempt to get from Discord, fallback to ID)
    const getEntityName = (key: string) => {
        const [type, id] = key.split("-");
        
        try {
            if (type === "server") {
                const guild = findByPropsLazy("getGuild").getGuild(id);
                return guild?.name || id;
            } else if (type === "channel") {
                const channel = findByPropsLazy("getChannel").getChannel(id);
                return channel?.name || id;
            } else if (type === "user") {
                const user = findByPropsLazy("getUser").getUser(id);
                return user?.username || id;
            }
