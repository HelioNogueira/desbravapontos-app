@echo off
title Servidor DesbravaPontos
cd /d "%~dp0server"
echo ========================================================
echo    INICIANDO SERVIDOR DESBRAVAPONTOS & LEILAO
echo ========================================================
echo Servidor rodando em: http://192.168.0.5:3001
echo Para encerrar, feche esta janela.
echo ========================================================
npm start
pause
