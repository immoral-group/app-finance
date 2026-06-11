import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/utils';
import { Download } from 'lucide-react';
import {
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    ComposedChart,
    Line
} from 'recharts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function PLReport() {
    const [year, setYear] = useState(new Date().getFullYear());

    const { data: plData } = useQuery({
        queryKey: ['pl', year],
        queryFn: () => adminApi.getPLSummary(year),
    });

    const chartData = MONTHS.map((month, index) => ({
        name: month,
        Income: plData?.income.real[index] || 0,
        Expenses: plData?.expenses.real[index] || 0,
        BudgetIncome: plData?.income.budget[index] || 0,
        Margin: plData?.margin.real[index] || 0
    }));

    const totalIncomeReal = plData?.income.real.reduce((a, b) => a + b, 0) || 0;
    const totalIncomeBudget = plData?.income.budget.reduce((a, b) => a + b, 0) || 0;
    const totalExpensesReal = plData?.expenses.real.reduce((a, b) => a + b, 0) || 0;
    const totalExpensesBudget = plData?.expenses.budget.reduce((a, b) => a + b, 0) || 0;
    const totalMarginReal = plData?.margin.real.reduce((a, b) => a + b, 0) || 0;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight">P&L Report</h1>
                    <p className="text-muted-foreground mt-1">Profit & Loss Statement for {year}</p>
                </div>
                <div className="flex items-center gap-4">
                    <Button variant="outline" onClick={() => setYear(year - 1)}>
                        {year - 1}
                    </Button>
                    <span className="font-bold text-lg">{year}</span>
                    <Button variant="outline" onClick={() => setYear(year + 1)}>
                        {year + 1}
                    </Button>
                    <Button onClick={() => window.print()} className="gap-2">
                        <Download size={16} />
                        Export PDF
                    </Button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <CardContent className="p-6">
                        <p className="text-sm font-medium text-muted-foreground">Total Income (YTD)</p>
                        <div className="flex items-end justify-between mt-2">
                            <h3 className="text-2xl font-bold">{formatCurrency(totalIncomeReal)}</h3>
                            <span className={`text-sm font-medium ${totalIncomeReal >= totalIncomeBudget ? 'text-green-600' : 'text-red-500'}`}>
                                vs Budget: {formatCurrency(totalIncomeBudget)}
                            </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5 mt-4">
                            <div
                                className="bg-green-500 h-1.5 rounded-full"
                                style={{ width: `${Math.min((totalIncomeReal / (totalIncomeBudget || 1)) * 100, 100)}%` }}
                            ></div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-6">
                        <p className="text-sm font-medium text-muted-foreground">Total Expenses (YTD)</p>
                        <div className="flex items-end justify-between mt-2">
                            <h3 className="text-2xl font-bold">{formatCurrency(totalExpensesReal)}</h3>
                            <span className={`text-sm font-medium ${totalExpensesReal <= totalExpensesBudget ? 'text-green-600' : 'text-red-500'}`}>
                                vs Budget: {formatCurrency(totalExpensesBudget)}
                            </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5 mt-4">
                            <div
                                className="bg-red-500 h-1.5 rounded-full"
                                style={{ width: `${Math.min((totalExpensesReal / (totalExpensesBudget || 1)) * 100, 100)}%` }}
                            ></div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-6">
                        <p className="text-sm font-medium text-muted-foreground">Net Margin (YTD)</p>
                        <div className="flex items-end justify-between mt-2">
                            <h3 className={`text-2xl font-bold ${totalMarginReal >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                {formatCurrency(totalMarginReal)}
                            </h3>
                            <span className="text-sm font-medium text-muted-foreground">
                                {(totalIncomeReal > 0 ? (totalMarginReal / totalIncomeReal) * 100 : 0).toFixed(1)}% Ratio
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Main Chart */}
            <Card>
                <CardHeader>
                    <CardTitle>Income vs Expenses vs Margin</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                                <Legend />
                                <Bar dataKey="Income" fill="#22c55e" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                <Line type="monotone" dataKey="Margin" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            {/* Detailed Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Detailed Breakdown</CardTitle>
                </CardHeader>
                <div className="rounded-md border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 border-b">
                            <tr>
                                <th className="h-10 px-4 text-left font-medium">Month</th>
                                <th className="h-10 px-4 text-right font-medium text-green-600">Real Income</th>
                                <th className="h-10 px-4 text-right font-medium text-muted-foreground">Budget Income</th>
                                <th className="h-10 px-4 text-right font-medium text-red-600">Real Expenses</th>
                                <th className="h-10 px-4 text-right font-medium text-muted-foreground">Budget Expenses</th>
                                <th className="h-10 px-4 text-right font-medium text-blue-600">Net Margin</th>
                            </tr>
                        </thead>
                        <tbody>
                            {MONTHS.map((month, i) => (
                                <tr key={month} className="border-b last:border-0 hover:bg-muted/50">
                                    <td className="p-4 font-medium">{month}</td>
                                    <td className="p-4 text-right font-medium">{formatCurrency(plData?.income.real[i] || 0)}</td>
                                    <td className="p-4 text-right text-muted-foreground">{formatCurrency(plData?.income.budget[i] || 0)}</td>
                                    <td className="p-4 text-right font-medium">{formatCurrency(plData?.expenses.real[i] || 0)}</td>
                                    <td className="p-4 text-right text-muted-foreground">{formatCurrency(plData?.expenses.budget[i] || 0)}</td>
                                    <td className={`p-4 text-right font-bold ${(plData?.margin.real[i] || 0) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                        {formatCurrency(plData?.margin.real[i] || 0)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
