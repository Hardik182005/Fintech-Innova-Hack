# setup_task.ps1 - Register Windows Scheduled Task for hourly push
$TaskName = "Fintech-Innova-Hack-HourlyPush"
$ScriptPath = "E:\Innovahack\Fintech-Innova-Hack\auto_push.ps1"

$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`""
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1)

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Description "Hourly automated git commit and push for Fintech-Innova-Hack repository"

Write-Host "Task '$TaskName' registered successfully."
