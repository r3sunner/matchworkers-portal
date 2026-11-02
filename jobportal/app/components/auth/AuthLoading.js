export default function AuthLoading({ text = "Checking login session..." }) {
    return (
        <div className="flex min-h-screen items-center justify-center px-4">
            <div className="rounded-2xl border border-gray-200 bg-white px-8 py-10 shadow-sm text-center">
                <div className="text-lg font-semibold text-red-700">{text}</div>
                <div className="mt-1 text-sm text-gray-500">Please wait</div>
            </div>
        </div>
    );
}