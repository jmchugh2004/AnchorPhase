
import React, { useState } from 'react';
import { AppData, Group } from '../types';
import { createGroup, updateGroupSharedTemplate, applyGroupTemplateToUser, addGroupFromImport, removeGroup, formatDateFriendly } from '../services/dataService';

interface GroupManagementProps {
  appData: AppData;
  onDataChange: (newData: AppData) => void;
}

const GroupManagement: React.FC<GroupManagementProps> = ({ appData, onDataChange }) => {
  const [newGroupName, setNewGroupName] = useState('');
  const [groupJsonToImport, setGroupJsonToImport] = useState('');

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) {
      alert("Please enter a name for the group.");
      return;
    }
    const newData = createGroup(appData, newGroupName);
    onDataChange(newData);
    setNewGroupName('');
    alert(`Group "${newGroupName}" created! You can now export its data to share.`);
  };

  const handleUpdateSharedTemplate = (groupId: string) => {
    if (window.confirm("This will update the group's shared template with your current weekly template. Are you sure?")) {
      const newData = updateGroupSharedTemplate(appData, groupId);
      onDataChange(newData);
      alert("Group's shared template updated.");
    }
  };

  const handleExportGroupData = (group: Group) => {
    const groupJson = JSON.stringify(group, null, 2);
    navigator.clipboard.writeText(groupJson)
      .then(() => alert(`Group data for "${group.name}" (Invite Code: ${group.inviteCode}) copied to clipboard! Share this JSON with members.`))
      .catch(err => alert("Failed to copy group data. Please try again or copy manually."));
    console.log("Export Group Data:", groupJson); // Log for manual copy if clipboard fails
  };

  const handleDeleteGroup = (groupId: string, groupName: string) => {
    if (window.confirm(`Are you sure you want to delete the group "${groupName}"? This cannot be undone.`)) {
      const newData = removeGroup(appData, groupId);
      onDataChange(newData);
      alert(`Group "${groupName}" deleted.`);
    }
  };

  const handleImportGroupData = () => {
    if (!groupJsonToImport.trim()) {
      alert("Please paste the group data JSON.");
      return;
    }
    const { newData, error, importedGroup } = addGroupFromImport(appData, groupJsonToImport);
    if (error) {
      alert(`Error importing group: ${error}`);
    } else if (importedGroup) {
      onDataChange(newData);
      alert(`Group "${importedGroup.name}" imported successfully! You can now sync its template.`);
    }
    setGroupJsonToImport('');
  };

  const handleSyncTemplate = (groupId: string, groupName: string) => {
    if (window.confirm(`This will replace your current weekly template with the template from group "${groupName}". Your logged workouts will NOT be affected. Continue?`)) {
      const newData = applyGroupTemplateToUser(appData, groupId);
      onDataChange(newData);
      alert(`Your weekly template is now synced with group "${groupName}".`);
    }
  };

  const handleLeaveGroup = (groupId: string, groupName: string) => {
     if (window.confirm(`Are you sure you want to leave the group "${groupName}"?`)) {
      const newData = removeGroup(appData, groupId);
      onDataChange(newData);
      alert(`You have left the group "${groupName}".`);
    }
  };

  const ownedGroups = appData.groups.filter(g => g.ownerId === appData.userId);
  const joinedGroups = appData.groups.filter(g => g.ownerId !== appData.userId);

  return (
    <div className="p-6 bg-white shadow-lg rounded-lg space-y-8">
      <header className="border-b pb-3 mb-6">
        <h2 className="text-2xl font-semibold text-blue-700">Group Management</h2>
        <p className="text-sm text-slate-500 mt-1">Share your workout templates with others. Your User ID: <strong className="select-all">{appData.userId}</strong></p>
      </header>

      {/* Create New Group Section */}
      <section className="p-4 border border-slate-200 rounded-md bg-slate-50 shadow-sm">
        <h3 className="text-xl font-medium text-blue-600 mb-3">Create a New Group</h3>
        <div className="flex flex-col sm:flex-row sm:space-x-2 space-y-2 sm:space-y-0">
          <input
            type="text"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="New Group Name"
            className="flex-grow p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-slate-100 text-black"
            aria-label="New Group Name"
          />
          <button
            onClick={handleCreateGroup}
            className="px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-opacity-50"
          >
            Create Group
          </button>
        </div>
      </section>

      {/* Owned Groups Section */}
      {ownedGroups.length > 0 && (
        <section>
          <h3 className="text-xl font-medium text-blue-600 mb-3">My Owned Groups</h3>
          <div className="space-y-4">
            {ownedGroups.map(group => (
              <div key={group.id} className="p-4 border border-slate-200 rounded-md bg-white shadow">
                <h4 className="text-lg font-semibold text-blue-700">{group.name}</h4>
                <p className="text-sm text-slate-500">Invite Code: <strong className="select-all text-slate-600">{group.inviteCode}</strong></p>
                <p className="text-xs text-slate-400">Last Updated: {formatDateFriendly(new Date(group.lastUpdated))} at {new Date(group.lastUpdated).toLocaleTimeString()}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => handleUpdateSharedTemplate(group.id)}
                    className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Update & Share My Current Template
                  </button>
                  <button
                    onClick={() => handleExportGroupData(group)}
                    className="px-3 py-1.5 text-sm bg-green-500 text-white rounded hover:bg-green-600"
                  >
                    Export Group Data (for Sharing)
                  </button>
                  <button
                    onClick={() => handleDeleteGroup(group.id, group.name)}
                    className="px-3 py-1.5 text-sm bg-red-500 text-white rounded hover:bg-red-600"
                  >
                    Delete Group
                  </button>
                </div>
                 {appData.activeSyncedGroupId === group.id && (
                    <p className="mt-2 text-xs text-green-600 font-semibold">Your current template is actively synced from this group.</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Join Group Section */}
       <section className="p-4 border border-slate-200 rounded-md bg-slate-50 shadow-sm mt-6">
        <h3 className="text-xl font-medium text-blue-600 mb-3">Join a Group (via Import)</h3>
        <p className="text-sm text-slate-600 mb-2">Paste the Group Data JSON you received from a group owner here:</p>
        <textarea
          rows={5}
          value={groupJsonToImport}
          onChange={(e) => setGroupJsonToImport(e.target.value)}
          placeholder='Paste Group JSON here (e.g., {"id": "...", "name": "...", ...})'
          className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-slate-100 text-black text-xs"
          aria-label="Paste Group JSON for import"
        />
        <button
          onClick={handleImportGroupData}
          className="mt-2 px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-opacity-50"
        >
          Import Group Data
        </button>
      </section>

      {/* Joined Groups Section */}
      {joinedGroups.length > 0 && (
        <section className="mt-6">
          <h3 className="text-xl font-medium text-blue-600 mb-3">My Joined Groups</h3>
          <div className="space-y-4">
            {joinedGroups.map(group => (
              <div key={group.id} className={`p-4 border rounded-md bg-white shadow ${appData.activeSyncedGroupId === group.id ? 'border-orange-500 ring-2 ring-orange-300' : 'border-slate-200'}`}>
                <h4 className="text-lg font-semibold text-blue-700">{group.name}</h4>
                <p className="text-sm text-slate-500">Owner ID: {group.ownerId}</p>
                <p className="text-sm text-slate-500">Invite Code: <strong className="text-slate-600">{group.inviteCode}</strong></p>
                <p className="text-xs text-slate-400">Template Last Updated by Owner: {formatDateFriendly(new Date(group.lastUpdated))} at {new Date(group.lastUpdated).toLocaleTimeString()}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => handleSyncTemplate(group.id, group.name)}
                    className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                    disabled={appData.activeSyncedGroupId === group.id}
                  >
                    {appData.activeSyncedGroupId === group.id ? 'Template Synced' : 'Sync Template to My Workouts'}
                  </button>
                  <button
                    onClick={() => handleLeaveGroup(group.id, group.name)}
                    className="px-3 py-1.5 text-sm bg-red-400 text-white rounded hover:bg-red-500"
                  >
                    Leave Group
                  </button>
                </div>
                {appData.activeSyncedGroupId === group.id && (
                    <p className="mt-2 text-xs text-green-600 font-semibold">Your current template is actively synced from this group.</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      {ownedGroups.length === 0 && joinedGroups.length === 0 && (
        <p className="text-center text-slate-500 mt-4">You are not part of any groups yet. Create one or import group data to join!</p>
      )}
    </div>
  );
};

export default GroupManagement;
