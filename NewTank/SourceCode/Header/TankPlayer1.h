// TankPlayer1.h: interface for the CTankPlayer1 class.
//
//////////////////////////////////////////////////////////////////////

#if !defined(AFX_TANKPLAYER1_H__3633BF93_D762_4D59_972B_DE50DF34F23F__INCLUDED_)
#define AFX_TANKPLAYER1_H__3633BF93_D762_4D59_972B_DE50DF34F23F__INCLUDED_

#include "TankPlayer.h"

#if _MSC_VER > 1000
#pragma once
#endif // _MSC_VER > 1000

class CTankPlayer1 : public CTankPlayer  
{
private:
	float m_fTransCD;
	bool m_bTransState;
	float m_fTransTime;
	float m_fTransCCTime;
	float m_fTranFireCount;
public:
	//main
	CTankPlayer1(const char* szname);
	virtual ~CTankPlayer1();
	void OnMove(int iKey, bool bPress); 
	void OnFire();
	void Init();//初始化
	void OnHeal();//治疗方法
	void TankLoop(float fDeltaTime);
	void Speed();
	void Trans();
	void TransFire();
	//Get
	
	//Set
};

#endif // !defined(AFX_TANKPLAYER1_H__3633BF93_D762_4D59_972B_DE50DF34F23F__INCLUDED_)
