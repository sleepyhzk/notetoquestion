#include <windows.h>
#include "MinHook.h"

// Con trỏ lưu địa chỉ của hàm MessageBoxW thật
typedef int (WINAPI *MESSAGEBOXW)(HWND, LPCWSTR, LPCWSTR, UINT);
MESSAGEBOXW fpMessageBoxW = NULL;

// Hàm giả mạo: Sẽ được gọi thay vì hàm thật
int WINAPI DetourMessageBoxW(HWND hWnd, LPCWSTR lpText, LPCWSTR lpCaption, UINT uType) {
    // Thay đổi nội dung gốc thành nội dung mới
    return fpMessageBoxW(hWnd, L"Nội dung đã bị Hook thay đổi!", L"Hook Thành Công", uType);
}

BOOL APIENTRY DllMain(HMODULE hModule, DWORD  ul_reason_for_call, LPVOID lpReserved) {
    switch (ul_reason_for_call) {
    case DLL_PROCESS_ATTACH:
        // Khởi tạo thư viện MinHook
        MH_Initialize();

        // Tạo Hook tại địa chỉ của hàm MessageBoxW trong thư viện user32.dll
        MH_CreateHook(&MessageBoxW, &DetourMessageBoxW, reinterpret_cast<LPVOID*>(&fpMessageBoxW));

        // Kích hoạt Hook
        MH_EnableHook(&MessageBoxW);
        break;
    
    case DLL_PROCESS_DETACH:
        // Gỡ bỏ Hook khi thoát
        MH_DisableHook(&MessageBoxW);
        MH_Uninitialize();
        break;
    }
    return TRUE;
}