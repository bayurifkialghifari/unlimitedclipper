param(
    [Parameter(Mandatory = $true)][int]$ApplicationProcessId,
    [Parameter(Mandatory = $true)][string]$FixturePath
)

$ErrorActionPreference = 'Stop'
$fixture = (Resolve-Path -LiteralPath $FixturePath).Path
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class NativeFileDialog {
    public delegate bool EnumProc(IntPtr handle, IntPtr parameter);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr parameter);
    [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumProc callback, IntPtr parameter);
    [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr handle, out int processId);
    [DllImport("user32.dll")] public static extern int GetClassName(IntPtr handle, StringBuilder name, int length);
    [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr handle);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr handle, uint message, IntPtr parameter, string value);
    [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr handle, uint message, IntPtr parameter, IntPtr value);
}
'@

$script:dialog = [IntPtr]::Zero
[void][NativeFileDialog]::EnumWindows({
    param($handle, $parameter)
    $processId = 0
    [void][NativeFileDialog]::GetWindowThreadProcessId($handle, [ref]$processId)
    $className = New-Object System.Text.StringBuilder 256
    [void][NativeFileDialog]::GetClassName($handle, $className, 256)
    if ($processId -eq $ApplicationProcessId -and $className.ToString() -eq '#32770') {
        $script:dialog = $handle
    }
    return $true
}, [IntPtr]::Zero)

if ($script:dialog -eq [IntPtr]::Zero) {
    throw 'The validation application has no native file dialog.'
}
$script:filename = [IntPtr]::Zero
$script:open = [IntPtr]::Zero
[void][NativeFileDialog]::EnumChildWindows($script:dialog, {
    param($handle, $parameter)
    $className = New-Object System.Text.StringBuilder 256
    [void][NativeFileDialog]::GetClassName($handle, $className, 256)
    $controlId = [NativeFileDialog]::GetDlgCtrlID($handle)
    if ($className.ToString() -eq 'Edit' -and $controlId -eq 1148) {
        $script:filename = $handle
    }
    if ($className.ToString() -eq 'Button' -and $controlId -eq 1) {
        $script:open = $handle
    }
    return $true
}, [IntPtr]::Zero)
if ($script:filename -eq [IntPtr]::Zero -or $script:open -eq [IntPtr]::Zero) {
    throw 'The native file dialog did not expose its filename and Open controls.'
}
[void][NativeFileDialog]::SendMessage($script:filename, 0x000C, [IntPtr]::Zero, $fixture)
[void][NativeFileDialog]::SendMessage($script:open, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero)
