import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PeriodSelector } from '@/components/shared/PeriodSelector';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/utils';
import { DEPARTMENTS, DEPARTMENT_COLORS } from '@/lib/constants';
import {
    Plus,
    Trash2,
    Edit,
    Split,
    Search,
} from 'lucide-react';

export default function ExpensesList() {
    const [date, setDate] = useState(new Date());
    const [searchTerm, setSearchTerm] = useState('');
    const queryClient = useQueryClient();

    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    const { data, isLoading } = useQuery({
        queryKey: ['expenses', year, month],
        queryFn: () => adminApi.getExpenses(year, month),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => adminApi.deleteExpense(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['expenses'] });
        }
    });

    const expenses = data?.expenses || [];

    // Filter expenses
    const filteredExpenses = expenses.filter(exp =>
        exp.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        exp.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Expenses Management</h1>
                    <p className="text-muted-foreground mt-1">Track and manage operational costs.</p>
                </div>
                <Button className="gap-2">
                    <Plus size={16} />
                    Add Expense
                </Button>
            </div>

            <div className="flex items-center justify-between gap-4 p-4 bg-card border rounded-lg">
                <div className="flex items-center gap-4 flex-1">
                    <PeriodSelector value={date} onChange={setDate} />
                    <div className="h-8 w-px bg-border" />
                    <div className="relative w-64">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search expenses..."
                            className="pl-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right mr-4">
                        <p className="text-sm text-muted-foreground">Total Period</p>
                        <p className="text-xl font-bold">{formatCurrency(totalExpenses)}</p>
                    </div>
                    <Button variant="secondary" className="gap-2">
                        <Split size={16} />
                        Prorate General
                    </Button>
                </div>
            </div>

            <Card>
                <div className="rounded-md border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 border-b">
                            <tr>
                                <th className="h-10 px-4 text-left font-medium text-muted-foreground">Date</th>
                                <th className="h-10 px-4 text-left font-medium text-muted-foreground">Description</th>
                                <th className="h-10 px-4 text-left font-medium text-muted-foreground">Category</th>
                                <th className="h-10 px-4 text-left font-medium text-muted-foreground">Department</th>
                                <th className="h-10 px-4 text-right font-medium text-muted-foreground">Amount</th>
                                <th className="h-10 px-4 text-center font-medium text-muted-foreground w-20">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading expenses...</td></tr>
                            ) : filteredExpenses.length === 0 ? (
                                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No expenses found for this period.</td></tr>
                            ) : (
                                filteredExpenses.map((expense) => {
                                    const dept = DEPARTMENTS.find(d => d.code === expense.department_code) || DEPARTMENTS[3];
                                    const deptColors = DEPARTMENT_COLORS[dept.code as keyof typeof DEPARTMENT_COLORS] || DEPARTMENT_COLORS.GEN;

                                    return (
                                        <tr key={expense.id} className="border-b hover:bg-muted/50 transition-colors">
                                            <td className="p-4">{new Date(expense.expense_date).toLocaleDateString()}</td>
                                            <td className="p-4 font-medium">{expense.description}</td>
                                            <td className="p-4">
                                                <Badge variant="outline">{expense.category}</Badge>
                                            </td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${deptColors.bg} ${deptColors.text}`}>
                                                    {dept.name}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right font-bold">{formatCurrency(expense.amount)}</td>
                                            <td className="p-4 flex justify-center gap-2">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                                    <Edit size={14} />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                    onClick={() => {
                                                        if (confirm('Are you sure?')) deleteMutation.mutate(expense.id)
                                                    }}
                                                >
                                                    <Trash2 size={14} />
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
