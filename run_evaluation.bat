@echo off
title FraudShield - Bidirectional Evaluation Runner

echo ====================================================================
echo      FraudShield: Bidirectional Fraud Detection & Evaluation
echo ====================================================================
echo.
echo Running full bidirectional validation on evaluation dataset (30 samples)...
echo Mode: Test A (Local Filter), Test B (BERT Only), Test C (Full Pipeline)
echo.

cd /d "%~dp0model"

if exist venv\Scripts\activate.bat (
    call venv\Scripts\activate.bat
    python evaluate_bidirectional.py
) else (
    echo [!] Virtual environment not found in model\venv. Attempting system python...
    python evaluate_bidirectional.py
)

echo.
echo ====================================================================
echo Evaluation finished. Machine-readable output:
echo   model\evaluation_results.json
echo ====================================================================
echo.
pause
