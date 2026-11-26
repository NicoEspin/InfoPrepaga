[CmdletBinding()]
param(
    [switch]$AllowMigrations
)

$deployCommand = 'cd ~/infoprepaga-crm && bash scripts/deploy.sh'
if ($AllowMigrations) {
    $deployCommand += ' --allow-migrations'
}

$deployKey = Join-Path $env:USERPROFILE '.ssh/infoprepaga_donweb'
ssh -t -p 5864 -o IdentitiesOnly=yes -o PreferredAuthentications=publickey `
    -i $deployKey deploy@149.50.143.145 $deployCommand
exit $LASTEXITCODE
