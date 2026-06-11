import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { VerticalsTab } from './components/VerticalsTab';
import { DepartmentsTab } from './components/DepartmentsTab';

export const SettingsPage: React.FC = () => {
    const { isSuperAdmin } = useAuth();
    const [activeTab, setActiveTab] = useState<'verticals' | 'departments'>('verticals');

    if (!isSuperAdmin()) {
        return <Navigate to="/" replace />;
    }

    return (
        <div className="p-4 sm:p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Configuración del Sistema</h1>
                <p className="text-muted-foreground">Gestiona las listas maestras y configuraciones generales.</p>
            </div>

            <div className="flex space-x-1 border-b">
                <button
                    className={`pb-3 px-6 text-sm font-medium transition-colors hover:text-blue-600 ${activeTab === 'verticals'
                        ? 'border-b-2 border-blue-600 text-blue-600'
                        : 'text-gray-500 hover:border-gray-300 border-b-2 border-transparent'
                        }`}
                    onClick={() => setActiveTab('verticals')}
                >
                    Verticales
                </button>
                <button
                    className={`pb-3 px-6 text-sm font-medium transition-colors hover:text-blue-600 ${activeTab === 'departments'
                        ? 'border-b-2 border-blue-600 text-blue-600'
                        : 'text-gray-500 hover:border-gray-300 border-b-2 border-transparent'
                        }`}
                    onClick={() => setActiveTab('departments')}
                >
                    Departamentos
                </button>
            </div>

            <div className="pt-2">
                {activeTab === 'verticals' && <VerticalsTab />}
                {activeTab === 'departments' && <DepartmentsTab />}
            </div>
        </div>
    );
};
